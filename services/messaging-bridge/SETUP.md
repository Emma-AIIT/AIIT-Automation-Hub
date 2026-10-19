# Messaging bridge – setup guide

The messaging bridge is a small always-on service. It lets the AIIT Hub's Broadcast page
**refresh groups** and **send messages/files** on:

- **Telegram**, signed in as Ali's own account (GramJS, not a bot)
- **Signal**, as a *linked device* of an existing Signal phone (signal-cli-rest-api)

It runs free on an Oracle Cloud "Always Free" ARM VM, using Docker. Caddy handles HTTPS
automatically. Follow the steps in order. Commands in grey boxes can be copied and pasted as-is.
Replace anything in `<angle brackets>` with your own value.

> Time needed: about 1 hour. You need Ali's phone for the Telegram login code and the
> phone that runs the Signal account (to scan a QR code).

---

## 1. Create the Oracle Cloud VM

1. Sign up at <https://www.oracle.com/cloud/free/>. A card is needed for identity checks; Always Free
   resources are not charged. Pick a **home region** close to Australia (e.g. *Australia East (Sydney)*).
   You cannot change it later.
2. In the console go to **☰ → Compute → Instances → Create instance**.
3. **Name:** `aiit-bridge`.
4. **Image and shape → Edit:**
   - Image: **Canonical Ubuntu 24.04** (22.04 also works).
   - Shape: **Ampere → VM.Standard.A1.Flex**, **2 OCPUs, 12 GB memory** (1 OCPU / 6 GB is enough
     if you want to keep the rest of your free allowance).
   - If you see "Out of capacity", try another *availability domain* or try again later.
5. **Networking:** keep the defaults (new VCN and public subnet) and make sure
   **Assign a public IPv4 address** is on.
6. **Add SSH keys:** choose **Generate a key pair for me** and click **Save private key**
   (and the public key). Keep the `.key` file safe; it is how you log in.
7. Click **Create**. When the instance shows **Running**, copy its **Public IP address**.
   This guide calls it `<vm-ip>`.

Log in from your laptop (Windows PowerShell, macOS or Linux terminal):

```bash
ssh -i <path-to-private.key> ubuntu@<vm-ip>
```

On macOS/Linux run `chmod 600 <path-to-private.key>` first if ssh complains about permissions.
On Windows, if ssh says the key's permissions are too open, right-click the key file → Properties →
Security → Advanced → Disable inheritance, and leave only your own user.

## 2. Open ports 80 and 443

Oracle blocks web traffic in **two** places. Open both.

**a) The cloud firewall (Security List).** In the console: **Instance → Primary VNIC → Subnet →
Security Lists → Default Security List → Add Ingress Rules**. Add two rules:

| Source CIDR | IP Protocol | Destination port |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

**b) The VM's own firewall.** Oracle's Ubuntu images ship iptables rules that reject everything
except SSH. On the VM (over ssh):

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p udp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

Check that the three new `ACCEPT` lines appear **above** the `REJECT ... icmp-host-prohibited` line:

```bash
sudo iptables -L INPUT --line-numbers
```

`netfilter-persistent save` keeps the rules after a reboot.

Do **not** open port 8080. The Signal API must never be public.

## 3. Install Docker and copy the bridge onto the VM

On the VM:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
exit
```

Log back in with the same `ssh` command (this applies the docker group), then check:

```bash
docker compose version
```

**Copy the bridge folder.** On your **laptop**, from the root of the Hub repository:

```bash
tar --exclude=node_modules --exclude=dist --exclude=.env -czf bridge.tgz -C services messaging-bridge
scp -i <path-to-private.key> bridge.tgz ubuntu@<vm-ip>:~
```

(`tar` is built into Windows 10/11 PowerShell as well.) Then on the **VM**:

```bash
tar -xzf bridge.tgz && cd ~/messaging-bridge
```

*(Alternative: `git clone` the Hub repository on the VM and `cd services/messaging-bridge`.
That needs GitHub access on the VM; the copy above does not.)*

**Create `.env`:**

```bash
cp .env.example .env
echo "BRIDGE_SECRET=$(openssl rand -hex 32)"
echo "BRIDGE_DOMAIN=$(curl -s https://ifconfig.me | tr . -).sslip.io"
nano .env
```

Paste the two printed lines into `.env` over the empty `BRIDGE_SECRET=` and `BRIDGE_DOMAIN=` lines.
Save with **Ctrl+O, Enter**, exit with **Ctrl+X**.

`BRIDGE_DOMAIN` uses [sslip.io](https://sslip.io): a free name like `203-0-113-10.sslip.io` that
always points at that IP, so no domain purchase is needed. If you own a domain, you can instead
create an `A` record (e.g. `bridge.allinitsolutions.com.au → <vm-ip>`) and use that.

Lock the file down (it will hold the Telegram login):

```bash
chmod 600 .env
```

All further commands run on the VM, inside the `messaging-bridge` folder.

## 4. Telegram: sign in as Ali's account

1. With Ali's phone at hand, open <https://my.telegram.org>, enter Ali's number and the code
   Telegram sends, then open **API development tools**.
2. Create an app (App title `AIIT Hub`, Short name `aiithub`, Platform `Other`). Copy **App api_id**
   and **App api_hash** into `.env` as `TELEGRAM_API_ID=` and `TELEGRAM_API_HASH=`.
3. Build the bridge image and run the login helper:

   ```bash
   docker compose build bridge
   docker compose run --rm --no-deps bridge node dist/scripts/telegram-login.js
   ```

   It asks for the phone number (`+61…`), the login code Telegram sends to the app, and the
   two-step verification password if Ali has one. It then prints one line:
   `TELEGRAM_SESSION=…`.
4. Paste that line into `.env` over the empty `TELEGRAM_SESSION=` line.

The session string **is** a full login to Ali's Telegram. Do not share it, paste it in chat, or
commit it. It shows in Telegram under **Settings → Devices** and can be revoked from there.

*(On a laptop with Node 20+ you can run the same helper with `npm install` then
`npm run telegram-login` inside `services/messaging-bridge`.)*

## 5. Signal: link the bridge to the existing phone

1. Start only the Signal API:

   ```bash
   docker compose up -d signal-api
   ```

2. On your **laptop**, open a second terminal and start an SSH tunnel. Keep it open:

   ```bash
   ssh -i <path-to-private.key> -L 8080:localhost:8080 ubuntu@<vm-ip>
   ```

3. In the laptop's browser, open:

   <http://localhost:8080/v1/qrcodelink?device_name=AIIT-Hub>

   A QR code appears. (If it times out, refresh the page for a new one.)
4. On the Signal phone: **Settings → Linked devices → + (Link new device)** and scan the code.
5. Confirm it worked. In the browser, open <http://localhost:8080/v1/accounts>. It should show the
   phone's number, e.g. `["+61412345678"]`.
6. Put that exact number into `.env` as `SIGNAL_NUMBER=+61412345678`, then restart the Signal API
   and close the tunnel:

   ```bash
   docker compose restart signal-api
   ```

## 6. Start everything and check it

```bash
docker compose up -d --build
docker compose ps
```

All three services (`bridge`, `signal-api`, `caddy`) should say **running**. Caddy fetches the
HTTPS certificate in the first minute. Then open in any browser:

`https://<BRIDGE_DOMAIN>/health`

You should see `{"ok":true,"telegram":true,"signal":true}`. A `false` means that platform is not
connected yet; see `docker compose logs bridge` (step 8). Signal can take a minute after a restart.

Quick test of a group refresh (from the VM, replace the values):

```bash
curl -X POST "https://<BRIDGE_DOMAIN>/telegram/sync-groups?key=<BRIDGE_SECRET>" \
  -H 'Content-Type: application/json' -d '{"trigger":"pull_groups"}'
```

## 7. Connect the Hub (Vercel environment variables)

In Vercel → the Hub project → **Settings → Environment Variables**, add these four for
**Production** (and Preview if wanted). Each is the full URL including the key:

| Name | Value |
|---|---|
| `TELEGRAM_BRIDGE_SYNC_GROUPS_URL` | `https://<BRIDGE_DOMAIN>/telegram/sync-groups?key=<BRIDGE_SECRET>` |
| `TELEGRAM_BRIDGE_SEND_URL` | `https://<BRIDGE_DOMAIN>/telegram/send?key=<BRIDGE_SECRET>` |
| `SIGNAL_BRIDGE_SYNC_GROUPS_URL` | `https://<BRIDGE_DOMAIN>/signal/sync-groups?key=<BRIDGE_SECRET>` |
| `SIGNAL_BRIDGE_SEND_URL` | `https://<BRIDGE_DOMAIN>/signal/send?key=<BRIDGE_SECRET>` |

Redeploy the Hub so it picks them up. On the Broadcast page, use **Refresh groups** on the Telegram
and Signal tabs, then send a test message to a test group.

## 8. Day-to-day: logs, updates, backups

**Logs** (one line per request: platform, action, chat id, ok/error; never message text):

```bash
cd ~/messaging-bridge
docker compose logs -f bridge        # Ctrl+C to stop watching
docker compose logs --tail 100 signal-api
```

**Restart:** `docker compose restart bridge`

**Update the bridge code:** copy the new folder over as in step 3 (your `.env` is not in the archive,
so it is kept), then:

```bash
docker compose up -d --build
```

**Update Signal API and Caddy images** (do this every month or two; Signal requires a recent
client):

```bash
docker compose pull signal-api caddy
docker compose up -d
```

**Back up** (keep copies off the VM, e.g. in the company password manager / drive):

- The **Telegram session** and secret live in `.env`. Copy it to your laptop:
  `scp -i <path-to-private.key> ubuntu@<vm-ip>:~/messaging-bridge/.env bridge.env.backup`
- The **Signal link** lives in the `signal-data` Docker volume:

  ```bash
  mkdir -p backups
  docker compose stop signal-api
  docker run --rm -v messaging-bridge_signal-data:/data -v "$PWD/backups":/backup alpine \
    tar czf /backup/signal-$(date +%F).tgz -C /data .
  docker compose start signal-api
  ```

  Then copy `backups/signal-<date>.tgz` off the VM with `scp`. To restore onto a fresh VM, create
  the stack once (`docker compose up -d signal-api && docker compose stop signal-api`), then run
  the same `docker run` with `tar xzf /backup/signal-<date>.tgz -C /data` instead.
  (The volume name is the folder name + `_signal-data`; check with `docker volume ls`.)

**Rotate the secret:** put a new `openssl rand -hex 32` value in `.env`,
`docker compose up -d bridge`, and update the four Vercel URLs.

## Risks and limits

- **Accounts can be limited for spammy sending.** Telegram and Signal both watch user accounts for
  bulk messaging. Keep the Hub's 15-minute pacing between broadcasts, only post to groups the
  account genuinely belongs to, and avoid sending the same text to many groups at once. If
  Telegram rate-limits, the bridge returns `429 Telegram: rate limited, try again in Ns`.
- **A linked Signal device is unlinked after about 30 days offline.** If the VM is stopped for a
  month (or the phone removes "AIIT-Hub" from Linked devices), repeat step 5. `/health` will show
  `"signal": false`.
- **Signal can only post to groups the account is already in.** Add the phone's account to the
  group first, then **Refresh groups** in the Hub.
- **Telegram session = Ali's login.** Anyone with `.env` can act as Ali on Telegram. If the VM or
  `.env` is ever exposed, terminate the session in Telegram → Settings → Devices and redo step 4.
- **Limits:** one file per message, up to 10 MB. Telegram captions over 1024 characters are sent as
  the file followed by a separate text message.
- **GramJS** (the `telegram` npm package) is archived upstream; its maintained fork is `teleproto`
  and is largely compatible, should a Telegram change ever break logins or sends.

---

## Reference: HTTP contract

All `/telegram/*` and `/signal/*` routes need `?key=<BRIDGE_SECRET>` (wrong/missing → `401`).
A platform whose variables are not set answers `503 "<Platform> is not configured"`.
Errors are short plain text, e.g. `Telegram: CHAT_WRITE_FORBIDDEN`.

| Route | Body | Success |
|---|---|---|
| `POST /{telegram\|signal}/sync-groups` | `{"trigger":"pull_groups"}` (ignored) | `200 {"synced": n, "groups": [{"id","name"}]}` |
| `POST /{telegram\|signal}/send` | JSON `{"chatId","message"}` or multipart `chatId`, `message`, `file` | `200 {"ok": true}` |
| `GET /health` | – (no key) | `200 {"ok": true, "telegram": bool, "signal": bool}` |

Telegram group ids are marked peer ids (`-100…` for supergroups/channels, `-…` for basic groups);
Signal group ids are the `group.…` form. Files are limited to 10 MB; requests time out after 55 s.
