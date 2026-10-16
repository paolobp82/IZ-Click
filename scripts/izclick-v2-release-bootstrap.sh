#!/usr/bin/env bash
# One-time server bootstrap for allowlisted V2 release. Run under normal 'izango' SSH account.
set -Eeuo pipefail
BASE='https://raw.githubusercontent.com/paolobp82/IZ-Click'
DIR=$(mktemp -d)
trap 'rm -rf "$DIR"' EXIT
curl -fsSL "$BASE/6091a417e08da058aa0ffba472564d67d78748c4/scripts/izclick-v2-deploy-controlled.sh" -o "$DIR/deploy"
curl -fsSL "$BASE/b1acde659744eef6f091480ccf51c5cf73a0ed23/scripts/izclick-v2-rollback.sh" -o "$DIR/rollback"
curl -fsSL "$BASE/ac7c0445b23427070de2df8c96b0c803b1431277/scripts/izclick-controlled-ops.sh" -o "$DIR/ops"
curl -fsSL "$BASE/fd2edab80a4e0fe353588ff06187f81d23a2bb02/scripts/izclick-ssh-operator.sh" -o "$DIR/ssh"
bash -n "$DIR/deploy" "$DIR/rollback" "$DIR/ops"
sh -n "$DIR/ssh"
sudo install -o root -g root -m 755 "$DIR/deploy" /usr/local/sbin/izclick-v2-deploy-controlled
sudo install -o root -g root -m 755 "$DIR/rollback" /usr/local/sbin/izclick-v2-rollback
sudo install -o root -g root -m 755 "$DIR/ops" /usr/local/sbin/izclick-controlled-ops
cat > "$DIR/sudoers" <<'EOF'
izango ALL=(root) NOPASSWD: /usr/local/sbin/izclick-controlled-ops preflight, /usr/local/sbin/izclick-controlled-ops backup, /usr/local/sbin/izclick-controlled-ops migration-test, /usr/local/sbin/izclick-controlled-ops minio-restore-test, /usr/local/sbin/izclick-controlled-ops release-inspect, /usr/local/sbin/izclick-controlled-ops stage-v2, /usr/local/sbin/izclick-controlled-ops deploy-v2, /usr/local/sbin/izclick-controlled-ops rollback-v2
EOF
sudo visudo -cf "$DIR/sudoers"
sudo install -o root -g root -m 440 "$DIR/sudoers" /etc/sudoers.d/izclick-automation
install -m 700 "$DIR/ssh" "$HOME/.local/bin/izclick-connection-check"
sudo -n /usr/local/sbin/izclick-controlled-ops preflight
echo V2_RELEASE_AUTOMATION_READY
