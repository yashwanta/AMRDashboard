#!/usr/bin/env bash
# collect-server-logs.sh — Combined AMR + Ubuntu server log collection
# Covers: crashes, OOM, disk errors, kernel panics, robot online/offline,
#         server restarts, Roboshop/RDS app logs, AMR connection analysis.
#
# Usage:
#   sudo bash collect-server-logs.sh [SINCE] [UNTIL]
#   SINCE defaults to "24 hours ago"
#   UNTIL defaults to "now"
#
# Environment overrides:
#   SINCE="yesterday 18:00"  UNTIL="today 06:00"  bash collect-server-logs.sh
#
# Output: ~/amr_report_<timestamp>/ + .tar.gz bundle

set -euo pipefail

# ─── Config ────────────────────────────────────────────────────────────────────
SINCE="${1:-${SINCE:-24 hours ago}}"
UNTIL="${2:-${UNTIL:-now}}"
HOSTNAME=$(hostname)
OUTDIR=~/amr_report_$(date +%Y%m%d_%H%M%S)
mkdir -p "$OUTDIR"

# Output files
F_README="$OUTDIR/00_README_SUMMARY.txt"
F_JOURNAL_RAW="$OUTDIR/01_journal_filtered.log"
F_KERNEL="$OUTDIR/02_kernel.log"
F_ROBOSHOP_SVC="$OUTDIR/03_startup_robod_service.log"
F_APP_LOGS="$OUTDIR/04_roboshop_app_events.log"
F_RDS_LOGS="$OUTDIR/05_rds_rdscore_robod_events.log"
F_AMR_RAW="$OUTDIR/06_amr_connection_raw.log"
F_AMR_SUMMARY="$OUTDIR/07_amr_connection_summary.txt"
F_AMR_DISCONNECTS="$OUTDIR/08_amr_disconnect_details.log"
F_TCP_NOW="$OUTDIR/09_live_tcp_amr.txt"
F_AMR_IPS_SEEN="$OUTDIR/10_unique_amr_ips_seen.txt"
F_AMR_IPS_LIVE="$OUTDIR/11_unique_amr_ips_live.txt"
F_SYSTEM_INFO="$OUTDIR/12_system_info.txt"
F_FULL_JOURNAL="$OUTDIR/99_full_journal.log"

AMR_GREP="Roboshop|rds|AMR|10\.216\.35|SocketState|ConnectedState|UnconnectedState|ClosingState|remote host closed|Connect timeout|Add device failed|Not connected|slotTcpError|setLastError|timeout|disconnect|connected|19204|19205|19206|19207"
CRASH_GREP="error|failed|fatal|exception|timeout|disconnect|UnconnectedState|ConnectedState|ClosingState|remote host closed|Add device failed|Not connected|segfault|core dumped|oom|killed|scene|smap|robot.cp"

log() { echo "[$(date +%H:%M:%S)] $*"; }

{
# ─── Header ────────────────────────────────────────────────────────────────────
echo "============================================================"
echo " AMR Dashboard Log Collection"
echo " Host:   $HOSTNAME"
echo " Date:   $(date)"
echo " Since:  $SINCE"
echo " Until:  $UNTIL"
echo " Output: $OUTDIR"
echo "============================================================"
echo

# ─── System Info ───────────────────────────────────────────────────────────────
echo "==================== SYSTEM INFO ===================="
hostnamectl 2>/dev/null || uname -a
uptime
echo "Last boot:"; who -b 2>/dev/null || last reboot | head -n 5
echo
echo "--- Reboots (last 10) ---"
last reboot | head -n 10
echo

echo "==================== DISK / MEMORY =================="
df -h
echo
free -h
echo
echo "--- Disk inodes ---"
df -i
echo

echo "==================== SERVICES ======================="
systemctl list-units --type=service --state=failed 2>/dev/null || true
echo
systemctl status startup_robod --no-pager -l 2>/dev/null | head -40 || true
systemctl status mysql --no-pager -l 2>/dev/null | head -20 || true
systemctl status mariadb --no-pager -l 2>/dev/null | head -20 || true
echo

echo "==================== PROCESSES ======================"
ps -eo pid,ppid,lstart,etime,%cpu,%mem,cmd \
  | grep -Ei "rds|seer|roboshop|fleet|rdscore|rbk|robod|java|mysql|mariadb" \
  | grep -v grep || true
echo

echo "==================== LISTENING PORTS ================"
ss -ltnp | grep -Ei "19204|19205|19206|19207|19208|8088|8080|3306|java|rds|rbk|roboshop|mysql|mariadb" || true
echo

echo "==================== MYSQL QUICK CHECK ==============="
mysql -e "SHOW DATABASES;" 2>/dev/null || true
mysql -D rds -e "SELECT COUNT(*) AS scene_records, MAX(id) AS max_id, MAX(create_time) AS last_scene_save FROM t_scene_record;" 2>/dev/null || true
echo

echo "==================== LARGE LOGS / DISK HOGS ========="
find /var/log /opt/Roboshop /opt/data -type f -size +100M -exec ls -lh {} \; 2>/dev/null | sort -k5 -h | head -20 || true
echo

echo "==================== COREDUMPS ======================"
coredumpctl list --since "$SINCE" 2>/dev/null \
  | grep -Ei "rds|seer|robo|fleet|rbk|java|RoboshopPro" || echo "(none or coredumpctl unavailable)"
echo

echo "==================== ROBOSHOP LOG FILES ============="
find /opt/Roboshop/bin/location/appInfo/log -type f -iname "*.log" \
  -printf "%TY-%Tm-%Td %TH:%TM %s %p\n" 2>/dev/null | sort || echo "(none found)"
echo

echo "==================== RDS/ROBOD FILE LOGS ============"
find /opt/data/rds /opt/data/rdscore /opt/data/robod -type f \
  \( -iname "*.log" -o -iname "*.out" -o -iname "*.err" -o -iname "*.txt" \) \
  -printf "%TY-%Tm-%Td %TH:%TM %s %p\n" 2>/dev/null | sort || echo "(none found)"
echo

echo "============================================================"
echo "Collecting detailed log files — see numbered files in $OUTDIR"
echo "============================================================"

} | tee "$F_README" | tee "$F_SYSTEM_INFO"

# ─── Journal: filtered for AMR/RDS/Roboshop events ────────────────────────────
log "Collecting filtered journal (AMR/RDS/Roboshop events)..."
journalctl --since "$SINCE" --until "$UNTIL" --no-pager -o short-iso 2>/dev/null \
  | grep -Ei "$AMR_GREP" \
  > "$F_JOURNAL_RAW" || true

# ─── Kernel / OOM / crash journal ─────────────────────────────────────────────
log "Collecting kernel log..."
journalctl -k --since "$SINCE" --until "$UNTIL" --no-pager -o short-iso 2>/dev/null \
  | grep -Ei "oom|out of memory|killed process|segfault|core dumped|error|fail|blocked|reset|link is down|link is up|panic|BUG:|OOPS:|watchdog|soft lockup|I/O error|EXT4|MCE|NMI" \
  > "$F_KERNEL" || true

# ─── Roboshop service journal ─────────────────────────────────────────────────
log "Collecting startup_robod service log..."
journalctl -u startup_robod --since "$SINCE" --until "$UNTIL" --no-pager -o short-iso 2>/dev/null \
  > "$F_ROBOSHOP_SVC" || true

# ─── Roboshop app log files ───────────────────────────────────────────────────
log "Scanning Roboshop app log files..."
START_TS=$(date -d "$SINCE" +%Y%m%d%H%M%S 2>/dev/null || date -d "24 hours ago" +%Y%m%d%H%M%S)
END_TS=$(date -d "$UNTIL" +%Y%m%d%H%M%S 2>/dev/null || date +%Y%m%d%H%M%S)

find /opt/Roboshop/bin/location/appInfo/log -type f -iname "*.log" -print0 2>/dev/null \
  | xargs -0 awk -v start="$START_TS" -v end="$END_TS" '
    {
      if (match($0, /\[([0-9]{8}) ([0-9]{6})\./, a)) {
        ts=a[1] a[2]
        if (ts >= start && ts <= end) print FILENAME ": " $0
      }
    }' 2>/dev/null \
  | grep -Ei "$AMR_GREP|$CRASH_GREP" \
  > "$F_APP_LOGS" || true

# ─── RDS / rdscore / robod file logs ─────────────────────────────────────────
log "Scanning RDS/robod log files..."
find /opt/data/rds /opt/data/rdscore /opt/data/robod -type f \
  \( -iname "*.log" -o -iname "*.out" -o -iname "*.err" -o -iname "*.txt" \) \
  -mmin -1440 -print0 2>/dev/null \
  | xargs -0 grep -HinEi \
    "$AMR_GREP|$CRASH_GREP|scene|smap|mysql|database" \
  2>/dev/null \
  > "$F_RDS_LOGS" || true

# ─── AMR connection analysis (from Script 1) ──────────────────────────────────
log "Building AMR connection analysis..."
cat "$F_JOURNAL_RAW" "$F_APP_LOGS" 2>/dev/null | sort -u > "$F_AMR_RAW"

# Live TCP connections to AMR IPs / ports
ss -tnp 2>/dev/null \
  | grep -Ei "10\.216\.35|19204|19205|19206|19207|Roboshop|rds|rbk" \
  > "$F_TCP_NOW" || true

# Per-IP connection summary
awk '
function get_ip_port(line,    arr) {
  if (match(line, /Server:([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+):([0-9]+)/, arr))
    return arr[1] ":" arr[2]
  if (match(line, /IP: *([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+).*port: *([0-9]+)/, arr))
    return arr[1] ":" arr[2]
  if (match(line, /([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+):(1920[4-7])/, arr))
    return arr[1] ":" arr[2]
  if (match(line, /([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/, arr))
    return arr[1] ":unknown"
  return "unknown"
}
{
  key = get_ip_port($0)
  if ($0 ~ /ConnectedState| connected/) {
    connected[key]++
    last_connected[key] = $0
  }
  if ($0 ~ /UnconnectedState|ClosingState|remote host closed|Connect timeout|Add device failed|Not connected|slotTcpError|setLastError|disconnect|timeout/) {
    disconnected[key]++
    last_disconnected[key] = $0
    if      ($0 ~ /remote host closed/)         reason[key,"remote_host_closed"]++
    else if ($0 ~ /Connect timeout|timeout/)    reason[key,"connect_timeout"]++
    else if ($0 ~ /Add device failed/)          reason[key,"add_device_failed"]++
    else if ($0 ~ /Not connected/)              reason[key,"not_connected"]++
    else if ($0 ~ /UnconnectedState/)           reason[key,"unconnected_state"]++
    else if ($0 ~ /ClosingState/)               reason[key,"closing_state"]++
    else if ($0 ~ /slotTcpError|setLastError/)  reason[key,"tcp_or_app_error"]++
    else                                         reason[key,"unknown_disconnect"]++
  }
}
END {
  print "AMR CONNECTION SUMMARY"
  print "======================"
  print ""
  printf "%-24s %-12s %-15s %-22s\n", "AMR_IP:PORT", "CONNECTED", "DISCONNECTED", "TOP_REASON"
  printf "%-24s %-12s %-15s %-22s\n", "-----------", "---------", "------------", "----------"
  for (k in connected) keys[k]=1
  for (k in disconnected) keys[k]=1
  for (k in keys) {
    top_reason="none"; top_count=0
    split("remote_host_closed connect_timeout add_device_failed not_connected unconnected_state closing_state tcp_or_app_error unknown_disconnect", rlist, " ")
    for (i in rlist) {
      r=rlist[i]; c=reason[k,r]+0
      if (c > top_count) { top_count=c; top_reason=r }
    }
    printf "%-24s %-12d %-15d %-22s\n", k, connected[k]+0, disconnected[k]+0, top_reason
  }
  print ""
  print "LAST CONNECTED EVENT PER AMR"
  print "============================"
  for (k in last_connected) { print ""; print "[" k "]"; print last_connected[k] }
  print ""
  print "LAST DISCONNECTED EVENT PER AMR"
  print "================================"
  for (k in last_disconnected) { print ""; print "[" k "]"; print last_disconnected[k] }
}
' "$F_AMR_RAW" | tee "$F_AMR_SUMMARY"

# Disconnect details
grep -Ei "UnconnectedState|ClosingState|remote host closed|Connect timeout|Add device failed|Not connected|slotTcpError|setLastError|disconnect|timeout" \
  "$F_AMR_RAW" > "$F_AMR_DISCONNECTS" || true

# Unique AMR IPs
grep -Eo "10\.216\.35\.[0-9]+" "$F_AMR_RAW" 2>/dev/null | sort -u > "$F_AMR_IPS_SEEN" || true
grep -Eo "10\.216\.35\.[0-9]+" "$F_TCP_NOW" 2>/dev/null | sort -u > "$F_AMR_IPS_LIVE" || true

# ─── Full journal (raw, for archiving) ────────────────────────────────────────
log "Saving full journal (raw)..."
journalctl --since "$SINCE" --until "$UNTIL" --no-pager -o short-iso 2>/dev/null \
  > "$F_FULL_JOURNAL" || true

# Copy standard system logs
cp -a /var/log/syslog* /var/log/auth.log* /var/log/kern.log* "$OUTDIR/" 2>/dev/null || true

# ─── Counts summary ───────────────────────────────────────────────────────────
{
echo
echo "============================================================"
echo " COUNTS SUMMARY"
echo "============================================================"
echo "Unique AMR IPs seen in window:      $(wc -l < "$F_AMR_IPS_SEEN" 2>/dev/null || echo 0)"
echo "Unique AMR IPs currently connected: $(wc -l < "$F_AMR_IPS_LIVE" 2>/dev/null || echo 0)"
echo "Total disconnect/error events:      $(wc -l < "$F_AMR_DISCONNECTS" 2>/dev/null || echo 0)"
echo "Total connected events:             $(grep -cEi "ConnectedState| connected" "$F_AMR_RAW" 2>/dev/null || echo 0)"
echo "Kernel/OOM/crash events:            $(wc -l < "$F_KERNEL" 2>/dev/null || echo 0)"
echo "Roboshop app events:                $(wc -l < "$F_APP_LOGS" 2>/dev/null || echo 0)"
echo "RDS/robod file events:              $(wc -l < "$F_RDS_LOGS" 2>/dev/null || echo 0)"
echo "============================================================"
echo
echo "Top crash/error keywords in window:"
grep -oEi "kernel panic|OOM|out of memory|segfault|I/O error|EXT4-fs error|UnconnectedState|remote host closed|Connect timeout|Add device failed|Failed to start" \
  "$F_KERNEL" "$F_JOURNAL_RAW" "$F_APP_LOGS" "$F_RDS_LOGS" 2>/dev/null \
  | sort | uniq -c | sort -rn | head -20 || true
echo
} | tee -a "$F_README"

# ─── Bundle ───────────────────────────────────────────────────────────────────
log "Creating tar bundle..."
tar -czf "$OUTDIR.tar.gz" -C "$(dirname "$OUTDIR")" "$(basename "$OUTDIR")"

echo
echo "DONE"
echo "Report folder: $OUTDIR"
echo "Bundle:        $OUTDIR.tar.gz"
echo
echo "Quick view of recent AMR connection summary:"
cat "$F_AMR_SUMMARY"
