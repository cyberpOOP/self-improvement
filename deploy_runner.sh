#!/bin/bash
set -e

REPO_URL="https://github.com/cyberpOOP/self-improvement"
RUNNER_TOKEN=$(aws ssm get-parameter --name "/github-runner/token" --with-decryption --query Parameter.Value --output text)
AMI_ID="ami-0122da1d0b4a30ec4" 
INSTANCE_TYPE="t3.micro"
IAM_PROFILE="arn:aws:iam::ACCOUNT_ID:instance-profile/ec2-runner-role"
SG_ID="sg-00bf47e5c03318fce"

USER_DATA=$(cat <<EOF
#!/bin/bash
yum update -y
yum install -y jq curl

# Install GitHub runner
mkdir -p /home/ec2-user/actions-runner && cd /home/ec2-user/actions-runner
curl -sL https://github.com/actions/runner/releases/download/v2.317.0/actions-runner-linux-x64-2.317.0.tar.gz | tar xz

# Register runner (ephemeral = de-registers after one job)
./config.sh \
  --url $REPO_URL \
  --token $RUNNER_TOKEN \
  --name "ephemeral-\$(hostname)" \
  --ephemeral \
  --unattended

# Run, then self-terminate
./run.sh
INSTANCE_ID=\$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
aws ec2 terminate-instances --instance-ids \$INSTANCE_ID --region \$(curl -s http://169.254.169.254/latest/meta-data/placement/region)
EOF
)

INSTANCE_ID=$(aws ec2 run-instances \
  --image-id "$AMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --iam-instance-profile Arn="$IAM_PROFILE" \
  --security-group-ids "$SG_ID" \
  --user-data "$USER_DATA" \
  --no-associate-public-ip-address \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=gh-runner-ephemeral}]' \
  --query 'Instances[0].InstanceId' \
  --output text)

echo "Runner instance launched: $INSTANCE_ID"
echo "It will self-terminate after tests complete."