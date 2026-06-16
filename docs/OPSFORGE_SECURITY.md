# OpsForge SSH Key Security Wiki

This page explains how RoboWatch/OpsForge connects to Linux servers safely, why it does not collect root passwords, and how to set up public/private key access for approved automation actions.

## Why This Security Model Exists

OpsForge can run powerful actions on servers, such as checking services, updating packages, applying remediation, and rebooting machines. Because these actions can affect production systems, RoboWatch avoids unsafe password handling.

RoboWatch does not:

- Store root passwords for automation.
- Ask for sudo passwords in the web UI.
- Pipe passwords into commands.
- Put passwords in command output, logs, scripts, environment variables, or generated commands.
- Use patterns such as `printf '%s\n' '<password>' | sudo -S`.

Instead, RoboWatch uses SSH public/private key authentication and a dedicated automation user.

## Why Not Use Root SSH Passwords?

Using root passwords over SSH creates several risks:

- A stolen app database or config could expose full root access.
- Passwords can accidentally appear in logs, command history, shell scripts, screenshots, or audit output.
- Root password reuse can turn one app compromise into many server compromises.
- There is no clean way to limit what a root password can do.
- Password-based automation often pushes teams toward insecure patterns such as piping passwords into `sudo`.

For those reasons, the safer default is:

```text
Dedicated SSH user + SSH key + limited passwordless sudo for approved RoboWatch scripts
```

## Public Key vs Private Key

SSH key authentication uses two related files:

| Key | Location | Purpose |
| --- | --- | --- |
| Private key | Windows/RoboWatch app host | Kept secret. RoboWatch uses it to prove identity. |
| Public key | Linux target server | Safe to install in `authorized_keys`. It allows the matching private key to connect. |

Important rule:

```text
Private key stays on the RoboWatch machine.
Public key goes on the Linux server.
```

Do not copy the private key to the Linux target server.

## Example File Locations

On the Windows machine running RoboWatch:

```text
C:\Users\Yashwanta.Thakur\.ssh\ansible_patch_key
C:\Users\Yashwanta.Thakur\.ssh\ansible_patch_key.pub
```

The private key starts with:

```text
-----BEGIN OPENSSH PRIVATE KEY-----
```

The public key starts with:

```text
ssh-ed25519
```

## Generate A Key On Windows

Run this from PowerShell on the Windows machine running RoboWatch:

```powershell
ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\ansible_patch_key -C "ansible patching key"
```

When asked for a passphrase for app automation, use an empty passphrase unless your deployment has a supported key-agent workflow.

This creates:

```text
Private key: C:\Users\<your-user>\.ssh\ansible_patch_key
Public key:  C:\Users\<your-user>\.ssh\ansible_patch_key.pub
```

If you overwrite or regenerate the key, the old public key on every Linux target will no longer match. You must reinstall the new `.pub` key on each target.

## Target Server Setup

Example target:

```text
USSHBUBUSTR250001
10.205.22.17
```

Run these commands on the Linux target as a sudo/root user.

First, copy the full one-line public key from Windows:

```text
C:\Users\Yashwanta.Thakur\.ssh\ansible_patch_key.pub
```

Then replace `PASTE_PUBLIC_KEY_HERE` below with that full public key:

```bash
sudo useradd -m -s /bin/bash robowatch 2>/dev/null || true
sudo install -d -m 700 -o robowatch -g robowatch /home/robowatch/.ssh
echo 'PASTE_PUBLIC_KEY_HERE' | sudo tee /home/robowatch/.ssh/authorized_keys >/dev/null
sudo chown robowatch:robowatch /home/robowatch/.ssh/authorized_keys
sudo chmod 600 /home/robowatch/.ssh/authorized_keys
```

## Limited Passwordless Sudo

OpsForge privileged actions run through approved backend command builders. The target user needs passwordless sudo only for the shell path RoboWatch uses to run those approved scripts.

Run this on the Linux target:

```bash
echo 'robowatch ALL=(root) NOPASSWD: /bin/sh, /usr/bin/sh' | sudo tee /etc/sudoers.d/robowatch-robowatch >/dev/null
sudo chmod 440 /etc/sudoers.d/robowatch-robowatch
sudo visudo -cf /etc/sudoers.d/robowatch-robowatch
```

Expected validation:

```text
/etc/sudoers.d/robowatch-robowatch: parsed OK
```

This is safer than storing sudo passwords because RoboWatch can run approved automation without knowing or transmitting a password.

## RoboWatch Server Record Setup

In RoboWatch:

1. Go to `Servers`.
2. Edit the target server.
3. Set the username:

```text
robowatch
```

4. Set auth type:

```text
Private Key
```

5. Open the private key file on Windows:

```text
C:\Users\Yashwanta.Thakur\.ssh\ansible_patch_key
```

6. Copy the full private key, including:

```text
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

7. Paste it into the RoboWatch `Private key` field.
8. Save the server record.

## Verify Access

In RoboWatch:

1. Open `OpsForge Automation`.
2. Select the target server.
3. Run:

```text
Check privilege access
```

Expected success:

```text
Privilege check: PASS. Passwordless sudo is available for approved RoboWatch shell actions; patch and reboot actions can run.
```

If this passes, RoboWatch can use approved privileged actions such as package remediation and reboot without collecting sudo passwords.

## Common Failures

### `parse private key: ssh: no key found`

The private key field does not contain a valid private key.

Fix:

- Paste `ansible_patch_key`, not `ansible_patch_key.pub`.
- The pasted value must include `BEGIN OPENSSH PRIVATE KEY` and `END OPENSSH PRIVATE KEY`.

### `unable to authenticate, attempted methods [none publickey]`

The target server rejected the private key.

Common causes:

- The matching public key was not installed on the target.
- The Windows key was regenerated, but the server still has the old public key.
- The public key was pasted incorrectly.
- File permissions on `/home/robowatch/.ssh` or `authorized_keys` are wrong.

Fix:

- Reinstall the current `.pub` key on the target.
- Confirm `/home/robowatch/.ssh` is `700`.
- Confirm `/home/robowatch/.ssh/authorized_keys` is `600`.

### `sudo: a password is required`

SSH login works, but the `robowatch` user does not have the required passwordless sudo rule.

Fix:

```bash
echo 'robowatch ALL=(root) NOPASSWD: /bin/sh, /usr/bin/sh' | sudo tee /etc/sudoers.d/robowatch-robowatch >/dev/null
sudo chmod 440 /etc/sudoers.d/robowatch-robowatch
sudo visudo -cf /etc/sudoers.d/robowatch-robowatch
```

Then rerun `Check privilege access`.

## Security Practices

Use these practices when deploying OpsForge:

- Use a dedicated automation user such as `robowatch`.
- Do not reuse personal SSH keys for automation.
- Do not use root password authentication for automation.
- Restrict SSH access to trusted networks or the RoboWatch host where possible.
- Keep `ALLOW_CUSTOM_COMMANDS=false` unless there is a specific approved need.
- Rotate the automation key if a laptop, backup, database, or private key may be compromised.
- Remove old public keys from `authorized_keys` after rotating keys.
- Review `action_runs` history for audit trail of automation activity.

## Key Rotation

To rotate the key:

1. Generate a new key on the RoboWatch Windows machine.
2. Install the new `.pub` key on each Linux target.
3. Paste the new private key into each RoboWatch server record.
4. Run `Check privilege access`.
5. Remove old public keys from each target `authorized_keys`.

## Summary

RoboWatch uses SSH keys because they are safer and easier to audit than root passwords. The app keeps the private key on the RoboWatch side, installs only the public key on the server, and uses a dedicated automation account with limited passwordless sudo for approved shell actions.

This design lets OpsForge patch and manage servers without collecting sudo passwords or exposing root credentials.
