#!/bin/bash
read -p "Enter GitHub runner token: " RUNNER_TOKEN

aws ssm put-parameter \
  --name "runner-token" \
  --value "$RUNNER_TOKEN" \
  --type SecureString \
  --overwrite

echo "Token stored successfully."