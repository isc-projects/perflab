# Hacks for development

THIS IS INTENDED ONLY FOR DEVELOPMENT.
Measurements in this environment are unreliable!

Dockerfile.devel in the top directory allows to run Perflab web interface
& Perflab agent & build BIND on the a single machine.


## Usage

1. Build new Perflab container images from the current source tree
   (includes a preconfigured MongoDB image):
```
docker-compose build
```

2. Start all containers in one go:
```
docker-compose up
```
This command will start:
- MongoDB
- MongoDB Express (web interface)
- Perflab web interface
- hacked Perflab agent
The hacked Perflab agent container does not use SSH.
It runs client & server processes in the same container.

3. After couple of seconds the following ports should be open:
- Perflab HTTP interface server on 127.0.0.1 port 8000
- MongoDB Express HTTP interface on 127.0.0.1 port 8081
- MongoDB on 127.0.0.1 port 27017
- NodeJS remote debugger for Perflab HTTP on 127.0.0.1 port 9222
- NodeJS remote debugger for Perflab agent on 127.0.0.1 port 9229

4. Rebuild from sources and restart as needed.
Database is persisted in the MongoDB container:
```
docker-compose stop
docker-compose build
docker-compose start
```

5. Remove all containers including the database:
```
docker-compose down
```
