#!/usr/bin/env bash
set -euo pipefail

# Paths
ZIP_FILE="deployment_package.zip"

build_lambda()  {
    LAMBDA_DIR=$1
    ZIP_FILE="${1}.zip"
    BUILD_DIR="lambda_package"
    echo "Cleaning previous build..."
    rm -rf "${BUILD_DIR}" "${ZIP_FILE}"
    mkdir -p "${BUILD_DIR}"
    echo "Installing dependencies into ${BUILD_DIR}..."
    python3 -m venv .tmp_venv
    # Activate venv for pip installs
    .  .tmp_venv/bin/activate
    pip install --upgrade pip
    # Install dependencies into the build directory (target)
    pip install --upgrade -r "${LAMBDA_DIR}/requirements.txt" -t "${BUILD_DIR}"
    deactivate
    rm -rf .tmp_venv
    echo "Copying lambda code..."
    cp "${LAMBDA_DIR}"/*.py "${BUILD_DIR}/"
    echo "Creating zip ${ZIP_FILE}..."
    cd "${BUILD_DIR}"
    zip -r9 "../${ZIP_FILE}" .
    cd ..
    echo "Build complete: ${ZIP_FILE} created."
}

build_lambda "file_manager"
build_lambda "zip_processor"
build_lambda "metadata_updater"

echo
echo "Running terraform init & apply..."
# Ensure Terraform has access to AWS credentials via environment or profile
terraform plan -out plan
# The apply below will upload the local ZIP file defined in terraform/main.tf (see filename)
terraform apply plan

echo "Done. Terraform applied."
