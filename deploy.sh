#!/usr/bin/env bash
# =============================================================================
# deploy.sh — PipelineGuardian: Full Google Cloud Run deployment
# =============================================================================
# Runs 7 steps in order:
#   1. Validate prerequisites
#   2. Enable GCP APIs
#   3. Create Artifact Registry repo
#   4. Store secrets in Secret Manager
#   5. Build + push multi-stage Docker image
#   6. Deploy to Cloud Run
#   7. Verify health endpoint
#
# Usage:
#   export GCP_PROJECT_ID=my-project
#   export GITLAB_TOKEN=glpat-xxx
#   export GEMINI_API_KEY=AIza-xxx
#   export SUPABASE_URL=https://xxx.supabase.co
#   export SUPABASE_ANON_KEY=eyJ...
#   export WEBHOOK_SECRET=my-webhook-secret
#   ./deploy.sh
# =============================================================================

set -euo pipefail

# ── Config ─────────────────────────────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
REGION="${GCP_REGION:-asia-south1}"
SERVICE="${SERVICE_NAME:-pipeline-guardian}"
REPO="${ARTIFACT_REPO:-pipeline-guardian}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}"
GITLAB_MCP_URL="${GITLAB_MCP_URL:-https://gitlab.com/api/v4/mcp}"
GEMINI_MODEL="${GEMINI_MODEL:-gemini-2.5-flash}"

# ── Colours ───────────────────────────────────────────────────────────────────
R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' B='\033[0;34m' N='\033[0m'
log()  { echo -e "${B}[$(date +%H:%M:%S)]${N} $*"; }
ok()   { echo -e "${G}  ✅ $*${N}"; }
warn() { echo -e "${Y}  ⚠️  $*${N}"; }
die()  { echo -e "${R}  ❌ $*${N}"; exit 1; }
banner() { echo -e "\n${B}══════════════════════════════════════════${N}"; echo -e "${B}  $*${N}"; echo -e "${B}══════════════════════════════════════════${N}"; }

# ─────────────────────────────────────────────────────────────────────────────
banner "Step 1/7 — Preflight checks"
# ─────────────────────────────────────────────────────────────────────────────

command -v gcloud >/dev/null || die "gcloud CLI not found → https://cloud.google.com/sdk/docs/install"
command -v docker  >/dev/null || die "Docker not found → https://docs.docker.com/get-docker/"
gcloud auth print-access-token >/dev/null 2>&1 || die "Not authenticated → run: gcloud auth login"

log "Project : $PROJECT_ID"
log "Region  : $REGION"
log "Service : $SERVICE"
log "Image   : $IMAGE"
ok "Preflight passed"

# ─────────────────────────────────────────────────────────────────────────────
banner "Step 2/7 — Enable required GCP APIs"
# ─────────────────────────────────────────────────────────────────────────────

gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    secretmanager.googleapis.com \
    --project="${PROJECT_ID}" \
    --quiet

ok "APIs enabled"

# ─────────────────────────────────────────────────────────────────────────────
banner "Step 3/7 — Artifact Registry"
# ─────────────────────────────────────────────────────────────────────────────

if ! gcloud artifacts repositories describe "${REPO}" \
    --location="${REGION}" --project="${PROJECT_ID}" --quiet 2>/dev/null; then
    gcloud artifacts repositories create "${REPO}" \
        --repository-format=docker \
        --location="${REGION}" \
        --description="PipelineGuardian Docker images" \
        --project="${PROJECT_ID}" \
        --quiet
    ok "Repository created: ${REPO}"
else
    ok "Repository already exists: ${REPO}"
fi

# Configure Docker auth for Artifact Registry
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
ok "Docker auth configured"

# ─────────────────────────────────────────────────────────────────────────────
banner "Step 4/7 — Store secrets in Secret Manager"
# ─────────────────────────────────────────────────────────────────────────────

# Helper: create or update a secret
upsert_secret() {
    local NAME="$1"
    local VALUE="$2"

    if [ -z "$VALUE" ]; then
        warn "Skipping $NAME — value is empty"
        return
    fi

    if gcloud secrets describe "$NAME" --project="${PROJECT_ID}" --quiet 2>/dev/null; then
        # Secret exists → add a new version
        echo -n "$VALUE" | gcloud secrets versions add "$NAME" \
            --data-file=- --project="${PROJECT_ID}" --quiet
        ok "Secret updated: $NAME"
    else
        # Create new secret
        echo -n "$VALUE" | gcloud secrets create "$NAME" \
            --data-file=- --project="${PROJECT_ID}" --quiet
        ok "Secret created: $NAME"
    fi
}

upsert_secret "GITLAB_TOKEN"    "${GITLAB_TOKEN:-}"
upsert_secret "GEMINI_API_KEY"  "${GEMINI_API_KEY:-}"
upsert_secret "SUPABASE_URL"    "${SUPABASE_URL:-}"
upsert_secret "SUPABASE_ANON_KEY" "${SUPABASE_ANON_KEY:-}"
upsert_secret "WEBHOOK_SECRET"  "${WEBHOOK_SECRET:-$(openssl rand -hex 32)}"

# Grant Cloud Run's service account access to all secrets
SA="${PROJECT_ID}-compute@developer.gserviceaccount.com"
log "Granting secretAccessor to: $SA"
for SECRET in GITLAB_TOKEN GEMINI_API_KEY SUPABASE_URL SUPABASE_ANON_KEY WEBHOOK_SECRET; do
    gcloud secrets add-iam-policy-binding "${SECRET}" \
        --member="serviceAccount:${SA}" \
        --role="roles/secretmanager.secretAccessor" \
        --project="${PROJECT_ID}" \
        --quiet 2>/dev/null || true   # Idempotent — ignore if already bound
done
ok "IAM bindings applied"

# ─────────────────────────────────────────────────────────────────────────────
banner "Step 5/7 — Build + push Docker image"
# ─────────────────────────────────────────────────────────────────────────────

TAG=$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)
log "Building image tag: $TAG"

DOCKER_BUILDKIT=1 docker build \
    --tag "${IMAGE}:${TAG}" \
    --tag "${IMAGE}:latest" \
    --cache-from "${IMAGE}:latest" \
    --build-arg BUILDKIT_INLINE_CACHE=1 \
    .

ok "Image built"

docker push "${IMAGE}:${TAG}"
docker push "${IMAGE}:latest"
ok "Image pushed → ${IMAGE}:${TAG}"

# ─────────────────────────────────────────────────────────────────────────────
banner "Step 6/7 — Deploy to Cloud Run"
# ─────────────────────────────────────────────────────────────────────────────

gcloud run deploy "${SERVICE}" \
    --image="${IMAGE}:${TAG}" \
    --region="${REGION}" \
    --platform=managed \
    --allow-unauthenticated \
    --port=8080 \
    --memory=1Gi \
    --cpu=1 \
    --min-instances=0 \
    --max-instances=10 \
    --timeout=300 \
    --concurrency=10 \
    --set-secrets="GITLAB_TOKEN=GITLAB_TOKEN:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_ANON_KEY=SUPABASE_ANON_KEY:latest,WEBHOOK_SECRET=WEBHOOK_SECRET:latest" \
    --set-env-vars="GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GITLAB_MCP_URL=${GITLAB_MCP_URL},GEMINI_MODEL=${GEMINI_MODEL}" \
    --project="${PROJECT_ID}" \
    --quiet

ok "Cloud Run deployed"

# ─────────────────────────────────────────────────────────────────────────────
banner "Step 7/7 — Verify deployment"
# ─────────────────────────────────────────────────────────────────────────────

SERVICE_URL=$(gcloud run services describe "${SERVICE}" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --format="value(status.url)")

log "Service URL: $SERVICE_URL"

# Wait up to 30s for health check
for i in $(seq 1 6); do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${SERVICE_URL}/health" || true)
    if [ "$HTTP_CODE" = "200" ]; then
        HEALTH=$(curl -sf "${SERVICE_URL}/health")
        ok "Health check passed: $HEALTH"
        break
    fi
    log "Health check attempt $i/6 (got $HTTP_CODE) — waiting 5s..."
    sleep 5
done

# Print the webhook URL for GitLab configuration
WEBHOOK_SECRET_VAL=$(gcloud secrets versions access latest \
    --secret="WEBHOOK_SECRET" \
    --project="${PROJECT_ID}" 2>/dev/null || echo "<check Secret Manager>")

echo ""
echo -e "${G}╔══════════════════════════════════════════════════════════════╗${N}"
echo -e "${G}║  🎉 PipelineGuardian deployed to Google Cloud Run!          ║${N}"
echo -e "${G}╚══════════════════════════════════════════════════════════════╝${N}"
echo ""
echo -e "  ${B}Service URL  :${N} $SERVICE_URL"
echo -e "  ${B}Frontend     :${N} $SERVICE_URL"
echo -e "  ${B}Health       :${N} $SERVICE_URL/health"
echo -e "  ${B}Agent Info   :${N} $SERVICE_URL/agent-info"
echo -e "  ${B}API Docs     :${N} $SERVICE_URL/api/docs"
echo -e "  ${B}Webhook URL  :${N} $SERVICE_URL/webhook/gitlab"
echo ""
echo -e "  ${Y}GitLab Webhook configuration:${N}"
echo -e "    URL    : ${SERVICE_URL}/webhook/gitlab"
echo -e "    Token  : $WEBHOOK_SECRET_VAL"
echo -e "    Events : Pipeline events"
echo ""
echo -e "  ${Y}Test command:${N}"
echo "  curl -X POST ${SERVICE_URL}/webhook/gitlab \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -H 'X-Gitlab-Event: Pipeline Hook' \\"
echo "    -H \"X-Gitlab-Token: \${WEBHOOK_SECRET}\" \\"
echo "    -d '{\"object_kind\":\"pipeline\",\"object_attributes\":{\"id\":9001,\"status\":\"failed\",\"ref\":\"main\",\"sha\":\"abc123\"},\"project\":{\"id\":12345,\"name\":\"test\",\"web_url\":\"https://gitlab.com/test\"},\"builds\":[{\"status\":\"failed\",\"name\":\"unit-tests\",\"stage\":\"test\"}],\"user\":{\"name\":\"Test User\"}}'"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Quick-redeploy function (run after code changes)
# ─────────────────────────────────────────────────────────────────────────────
echo -e "  ${Y}To redeploy after changes:${N}"
echo "  TAG=\$(git rev-parse --short HEAD)"
echo "  DOCKER_BUILDKIT=1 docker build -t ${IMAGE}:\$TAG -t ${IMAGE}:latest . && \\"
echo "  docker push ${IMAGE}:\$TAG && \\"
echo "  gcloud run deploy ${SERVICE} --image=${IMAGE}:\$TAG --region=${REGION} --project=${PROJECT_ID}"
