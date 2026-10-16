#!/usr/bin/env bash
# One-time installation of the allowlisted email API release commands.
set -Eeuo pipefail
BASE='https://raw.githubusercontent.com/paolobp82/IZ-Click'
DIR=$(mktemp -d)
trap 'rm -rf "$DIR"' EXIT
curl -fsSL "$BASE/ce025571f56e0417cf9277d78f75787cbbdc6bd5/scripts/izclick-email-deploy.sh" -o "$DIR/deploy"
curl -fsSL "$BASE/9f8666a2fcd472e47c52baa16885962daa2e3c69/scripts/izclick-email-rollback.sh" -o "$DIR/rollback"
curl -fsSL "$BASE/88078daee4e3dc7db8e035a8d6744867f350b435/scripts/izclick-controlled-ops.sh" -o "$DIR/ops"
curl -fsSL "$BASE/385ab83b4187ecc4ff907b5e13e65476c23671b1/scripts/izclick-ssh-operator.sh" -o "$DIR/ssh"
bash -n "$DIR/deploy" "$DIR/rollback" "$DIR/ops"
sh -n "$DIR/ssh"
sudo install -o root -g root -m 755 "$DIR/deploy" /usr/local/sbin/izclick-email-deploy
sudo install -o root -g root -m 755 "$DIR/rollback" /usr/local/sbin/izclick-email-rollback
sudo install -o root -g root -m 755 "$DIR/ops" /usr/local/sbin/izclick-controlled-ops
cat > "$DIR/sudoers" <<'EOF'
izango ALL=(root) NOPASSWD: /usr/local/sbin/izclick-controlled-ops preflight, /usr/local/sbin/izclick-controlled-ops backup, /usr/local/sbin/izclick-controlled-ops migration-test, /usr/local/sbin/izclick-controlled-ops minio-restore-test, /usr/local/sbin/izclick-controlled-ops release-inspect, /usr/local/sbin/izclick-controlled-ops stage-v2, /usr/local/sbin/izclick-controlled-ops deploy-v2, /usr/local/sbin/izclick-controlled-ops rollback-v2, /usr/local/sbin/izclick-controlled-ops deploy-emails, /usr/local/sbin/izclick-controlled-ops rollback-emails
EOF
sudo visudo -cf "$DIR/sudoers"
sudo install -o root -g root -m 440 "$DIR/sudoers" /etc/sudoers.d/izclick-automation
install -m 700 "$DIR/ssh" "$HOME/.local/bin/izclick-connection-check"
sudo -n /usr/local/sbin/izclick-controlled-ops preflight
echo "IZCLICK_EMAIL_RELEASE_READY"
