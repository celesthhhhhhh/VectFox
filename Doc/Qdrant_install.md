## Install Qdrant on Windows / Linux / macOS

Recommended method: **Docker** on all platforms.

Qdrant provides REST API on `6333`, Web UI on `/dashboard`, and gRPC on `6334`. By default, Qdrant stores local data in `./qdrant_storage`.  
Source: Qdrant official quickstart/docs.



## Install Qdrant on Windows

### 1. Install Docker Desktop

Download and install Docker Desktop for Windows:

- https://www.docker.com/products/docker-desktop/

After installation, restart Windows if Docker asks you to.

### 2. Create a Qdrant data folder

Open PowerShell:

```
powershell
mkdir C:\qdrant 
cd C:\qdrant'
```

### 3. Start Qdrant

```
docker run -d `
  --name qdrant `
  -p 6333:6333 `
  -p 6334:6334 `
  -v C:\qdrant\qdrant_storage:/qdrant/storage `
  qdrant/qdrant
```

### 4.Check that Qdrant is running

Open this in your browser:

```
http://localhost:6333/dashboard
```

You can also test the REST API:

```
curl http://localhost:6333
```

Expected result: Qdrant should return JSON showing the service is running.

### 5. Stop Qdrant

```
docker stop qdrant
```

### 6. Start Qdrant again

```
docker start qdrant
```

### 7. Remove Qdrant container

This removes the Docker container, but keeps your data in C:\qdrant\qdrant_storage.

```
docker stop qdrant
docker rm qdrant
```

### 8. Upgrade Qdrant

```
docker pull qdrant/qdrant
docker stop qdrant
docker rm qdrant

docker run -d `
  --name qdrant `
  -p 6333:6333 `
  -p 6334:6334 `
  -v C:\qdrant\qdrant_storage:/qdrant/storage `
  qdrant/qdrant
```

### Optional: Run Qdrant with Docker Compose

Create a file named docker-compose.yml:

```
services:
  qdrant:
    image: qdrant/qdrant
    container_name: qdrant
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - ./qdrant_storage:/qdrant/storage
    restart: unless-stopped
```

Start it:

```
docker compose up -d
```

Stop it:

```
docker compose down
```

Open the dashboard:

```
http://localhost:6333/dashboard
```

---

## Install Qdrant on Linux

Recommended method: **Docker Engine on Linux**.

### 1. Install Docker Engine

Follow the official guide for your distro:

- Ubuntu/Debian: https://docs.docker.com/engine/install/ubuntu/
- Fedora/RHEL: https://docs.docker.com/engine/install/fedora/

After installation, add your user to the docker group so you can run Docker without `sudo`:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

### 2. Create a Qdrant data folder

```bash
mkdir -p ~/qdrant/qdrant_storage
cd ~/qdrant
```

### 3. Start Qdrant

```bash
docker run -d \
  --name qdrant \
  -p 6333:6333 \
  -p 6334:6334 \
  -v ~/qdrant/qdrant_storage:/qdrant/storage \
  qdrant/qdrant
```

### 4. Check that Qdrant is running

```bash
curl http://localhost:6333
```

Or open `http://localhost:6333/dashboard` in your browser.

### 5. Stop / Start / Remove

```bash
docker stop qdrant
docker start qdrant
docker rm qdrant          # removes container, keeps data in ~/qdrant/qdrant_storage
```

### 6. Upgrade Qdrant

```bash
docker pull qdrant/qdrant
docker stop qdrant
docker rm qdrant

docker run -d \
  --name qdrant \
  -p 6333:6333 \
  -p 6334:6334 \
  -v ~/qdrant/qdrant_storage:/qdrant/storage \
  qdrant/qdrant
```

### Optional: Run Qdrant with Docker Compose

Create `docker-compose.yml`:

```yaml
services:
  qdrant:
    image: qdrant/qdrant
    container_name: qdrant
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - ./qdrant_storage:/qdrant/storage
    restart: unless-stopped
```

```bash
docker compose up -d
docker compose down
```

---

## Install Qdrant on macOS

Recommended method: **Docker Desktop on macOS**.

### 1. Install Docker Desktop

Download and install Docker Desktop for Mac (Apple Silicon or Intel):

- https://www.docker.com/products/docker-desktop/

After installation, launch Docker Desktop and wait for it to finish starting.

### 2. Create a Qdrant data folder

```bash
mkdir -p ~/qdrant/qdrant_storage
cd ~/qdrant
```

### 3. Start Qdrant

```bash
docker run -d \
  --name qdrant \
  -p 6333:6333 \
  -p 6334:6334 \
  -v ~/qdrant/qdrant_storage:/qdrant/storage \
  qdrant/qdrant
```

### 4. Check that Qdrant is running

```bash
curl http://localhost:6333
```

Or open `http://localhost:6333/dashboard` in your browser.

### 5. Stop / Start / Remove

```bash
docker stop qdrant
docker start qdrant
docker rm qdrant          # removes container, keeps data in ~/qdrant/qdrant_storage
```

### 6. Upgrade Qdrant

```bash
docker pull qdrant/qdrant
docker stop qdrant
docker rm qdrant

docker run -d \
  --name qdrant \
  -p 6333:6333 \
  -p 6334:6334 \
  -v ~/qdrant/qdrant_storage:/qdrant/storage \
  qdrant/qdrant
```

### Optional: Run Qdrant with Docker Compose

Same `docker-compose.yml` as shown in the Linux section above.

```bash
docker compose up -d
docker compose down
```