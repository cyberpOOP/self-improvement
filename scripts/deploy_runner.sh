# Self-Improvement Repository — Setup Guide

Automated LLM-powered code improvement agent + ephemeral AWS EC2 self-hosted GitHub Actions runner.

---

## Prerequisites — Tools to Install

| Tool | Purpose | Install |
|------|---------|---------|
| AWS CLI v2 | Deploy EC2, manage SSM | [docs.aws.amazon.com/cli](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) |
| AWS Session Manager Plugin | SSH-less tunnel access to EC2 | [Install guide](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html) |
| Python 3.12+ | Run agent.py locally or in Actions | [python.org](https://python.org) |
| Git (with LF line endings) | Commit improvements | See note below |
| OpenAI Python SDK | API for agent | `pip install openai` |

> **Windows users — critical:** Set Git to not convert line endings or all shell scripts will break on Linux EC2.
> ```bash
> git config --global core.autocrlf false
> ```
> In VS Code, always save `.sh` files with `LF` (bottom-right corner of the editor).

---

## Part 1 — LLM Self-Improvement Agent

### What it does
A GitHub Actions workflow runs every 2 hours, calls ChatGPT's OpenAI  API, applies one small improvement to the codebase (auth, error handling, logging, docs), and auto-commits it back to the repo.

### Step 1 — Fork a repo
Fork any Node.js repo into your GitHub account. This project targets an Express/Fastify gateway server.

### Step 2 — Get Anthropic API Key
1. Go to [platform.openai.com](https://platform.openai.com)
2. API Keys → Create new secret Key
3. Copy the key — you will not see it again

### Step 3 — Add GitHub Secret
1. Your repo → **Settings → Secrets and variables → Actions → New repository secret**
2. Name: `OPENAI_API_KEY`
3. Value: your key from Step 2

### Step 4 — Check workflow & agent.py files
Edit `.github/workflows/self-improve.yml` to your needs. The `agent.py` file is a Python script that calls the OpenAI API and makes improvements.

To test immediately: repo → **Actions** → Self-Improvement Agent → **Run workflow**.

---

## Part 2 — Ephemeral EC2 Self-Hosted Runner

### What it does
A one-click script provisions a private EC2 instance with no public SSH access. It registers as a GitHub Actions self-hosted runner, runs tests, then self-terminates to avoid costs.

### AWS Setup

#### Step 1 — Configure AWS CLI
```bash
aws configure
# Enter: Access Key ID, Secret Access Key, region (e.g. eu-north-1), output format: text
```

#### Step 2 — Create IAM Role for EC2

1. Go to **AWS Console → IAM → Roles → Create role**
2. Trusted entity: **AWS service → EC2**
3. Attach these policies:
   - `AmazonSSMManagedInstanceCore` — enables tunnel access without SSH
   - `AmazonEC2FullAccess` — allows instance to terminate itself
   - `AmazonSSMReadOnlyAccess` — allows reading the runner token from Parameter Store
   - `IAMFullAccess` — allows full IAM management
4. Name the role: `ec2-github-runner`
5. After creation, go to the role → **Instance profile ARN** — copy it to the deploy script

#### Step 3 — Create Security Group

1. **EC2 → Security Groups → Create security group**
2. **Inbound rules:** none (leave empty — no SSH, no port 22)
3. **Outbound rules:** allow all TCP to `0.0.0.0/0`

This enforces tunnel-only access.

#### Step 4 — Store GitHub Runner Token in SSM

Runner tokens expire after 1 hour — generate one fresh each time you deploy:

1. Go to your repo → **Settings → Actions → Runners → New self-hosted runner**
2. Copy the token from the `--token` line in the setup instructions
3. Store it:
```bash
aws ssm put-parameter \
  --name "runner-token" \
  --value "YOUR_TOKEN_HERE" \
  --type SecureString \
  --overwrite
```

#### Step 5 — Check deploy_runner.sh

**Edit the variables at the top** to match your AWS account and edit repo link in this command:
``` bash
AMI_ID="ami-0122da1d0b4a30ec4" 
INSTANCE_TYPE="t3.micro"
IAM_PROFILE="arn:aws:iam::382720393134:instance-profile/DevOps"
SUBNET_ID="subnet-06c745492d10280f2"
SG_ID="sg-00bf47e5c03318fce"
```

``` bash
31 RUNNER_ALLOW_RUNASROOT=true ./config.sh --url https://github.com/YOUR_USER/YOUR_REPO --token $AUTH_TOKEN --name "ephemeral-$(hostname)" --ephemeral --unattended
```

#### Step 6 — Test workflow

Create `.github/workflows/test.yml`:

```yaml
name: Run Tests
on:
  push:
  workflow_dispatch:

jobs:
  test:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test
```

Make sure `package.json` has Jest configured:
```json
{
  "scripts": {
    "test": "jest"
  },
  "devDependencies": {
    "jest": "^29.0.0"
  }
}
```

### Running the full flow

```bash
# 1. Generate fresh runner token (expires in 1 hour)
# Repo → Settings → Actions → Runners → New self-hosted runner → copy token

# 2. Store token in SSM
aws ssm put-parameter --name "runner-token" --value "TOKEN" --type SecureString --overwrite

# 3. Launch runner
bash deploy_runner.sh

# 4. Push code or manually trigger the test workflow
# EC2 picks up the job, runs tests, terminates itself
```

### Accessing the instance (no SSH)

```bash
# Connect via AWS SSM tunnel — no port 22, no public IP needed
aws ssm start-session --target i-XXXXXXXXXXXXXXXXX

# Debug boot logs inside the instance
cat /var/log/cloud-init-output.log
```

---

## Architecture Summary

```
Every 2 hours
    └── GitHub Actions (ubuntu-latest)
            ├── checkout repo
            ├── run agent.py → Claude API → patch files
            └── git commit & push
                    └── triggers test workflow
                            └── "Waiting for self-hosted runner..."
                                    └── (manually) bash deploy_runner.sh
                                            └── EC2 boots (private, no public IP)
                                                    ├── installs runner
                                                    ├── registers with GitHub
                                                    ├── runs npm test
                                                    └── self-terminates
```

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `No such file or directory: part-001` | Windows CRLF line endings in script | Set `core.autocrlf false`, resave with LF |
| `Must not run with sudo` | Running runner as root | Use `runuser -l ec2-user` or `RUNNER_ALLOW_RUNASROOT=1` |
| `404 Not Found` on runner registration | Token expired (1hr limit) | Generate a new token, update SSM |
| `Libicu missing` | Ubuntu/runner version mismatch | Add `libicu-dev` to apt-get install |
| Job stuck `Waiting for runner` | Runner never registered | Check `/var/log/cloud-init-output.log` via SSM session |
| `$RUNNER_TOKEN` empty on instance | Variable expanded locally | Use `'EOF'` (single quotes) in heredoc |