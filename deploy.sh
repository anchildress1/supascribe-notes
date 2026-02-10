#!/bin/bash
set -e

# Configuration
SERVICE_NAME="supascribe-notes-mcp"
REGION="us-east1"
PORT="8080"

# Check dependencies
if ! command -v gcloud &> /dev/null; then
    echo "Error: gcloud CLI is not installed."
    exit 1
fi

PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ "$PROJECT_ID" == "(unset)" ] || [ -z "$PROJECT_ID" ]; then
    echo "Error: No Google Cloud Project ID set. Run: gcloud config set project <PROJECT_ID>"
    exit 1
fi

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

echo "=================================================="
echo "DEPLOYMENT: $SERVICE_NAME"
echo "=================================================="
echo "Project: $PROJECT_ID ($PROJECT_NUMBER)"
echo "Region:  $REGION"
echo "=================================================="

# Load environment variables
for env_file in ".env" ".env.local"; do
    if [ -f "$env_file" ]; then
        set -a
        # shellcheck disable=SC1090
        . "$env_file"
        set +a
    fi
done

require_env() {
    local name=$1
    if [ -z "${!name}" ]; then
        echo "Error: Required env var '$name' is missing or empty."
        exit 1
    fi
}

require_env "SUPABASE_URL"
require_env "SUPABASE_SERVICE_ROLE_KEY"

# Enable required services
echo "Enabling required Google Cloud APIs..."
gcloud services enable \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    --project "$PROJECT_ID" --quiet

# Create Artifact Registry repo if needed
if ! gcloud artifacts repositories describe "$SERVICE_NAME" \
    --location="$REGION" --project "$PROJECT_ID" --quiet &>/dev/null; then
    echo "Creating Artifact Registry repository: $SERVICE_NAME..."
    gcloud artifacts repositories create "$SERVICE_NAME" \
        --repository-format=docker \
        --location="$REGION" \
        --project "$PROJECT_ID" \
        --description="Docker repository for $SERVICE_NAME"
fi

# Build and push image
IMAGE_URI="$REGION-docker.pkg.dev/$PROJECT_ID/$SERVICE_NAME/$SERVICE_NAME:latest"
echo "Building: $IMAGE_URI"
gcloud beta builds submit --tag "$IMAGE_URI" . --project "$PROJECT_ID"

# Deploy to Cloud Run
echo "Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
    --image "$IMAGE_URI" \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --allow-unauthenticated \
    --port "$PORT" \
    --set-env-vars "SUPABASE_URL=$SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY"

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
    --region "$REGION" --project "$PROJECT_ID" --format 'value(status.url)')

echo ""
echo "=================================================="
echo "DEPLOYMENT COMPLETE"
echo "=================================================="
echo "Service URL: $SERVICE_URL"
echo ""
echo "Smoke test:"
echo "  curl $SERVICE_URL/healthz"
echo "=================================================="
