![Travis CI](https://api.travis-ci.org/o2r-project/o2r-muncher.svg)
#o2r muncher

Node.js implementation of the o2r-web-api.

Requirements:

```
nodejs >= 6.2
npm

bagit-python
unzip
tar

mongodb
```

##Dockerfile

This project includes a `Dockerfile` which can be built with
```
docker build -t muncher .
```

The image can then be run and configured via environment variables. For convenience,
we include a `docker-compose` configuration, which can be run with

```
cd docker-compose && docker-compose up
# after you're done, shutdown and delete all volumes (data):
docker-compose down -v
```

__Please keep in mind that muncher needs access to a Docker daemon.__ For this
purpose the `docker-compose` configuration will expose your local Docker socket
to the muncher container. If you do not want that, you can point muncher to a
different Docker host via the `MUNCHER_DOCKER_HOST` and `MUNCHER_DOCKER_PORT`
environment variables.

###Available environment variables

* `MUNCHER_DOCKER_HOST`
  Define a different Docker Remote API location to connect to. If omitted, muncher will try to connect to the local unix socket.
* `MUNCHER_DOCKER_PORT`
  Port for Docker Remote API
* `MUNCHER_PORT`
  Define on which Port muncher should listen. Defaults to `8080`.
* `MUNCHER_MONGODB` __Required__
  Location for the mongo db. Defaults to `mongodb://localhost/`. You will very likely need to change this.
* `MUNCHER_MONGODB_COLLECTION`
  Which collection inside the mongo db should be used. Defaults to `muncher`.
* `MUNCHER_BASEPATH`
  Base path for the compendia storage. Defaults to `/tmp/muncher`. If you want persistent compendia storage, you should point this to a separate volume.
* `MUNCHER_APIKEY` __Recomended__
  The API key that is required for posting a new compendium. It is highly recommended that you change this to a secure key. Defaults to `CHANGE_ME`.

### Full API service with docker-compose

The o2r muncher only provides the main parts of the o2r web API. For example, serving the data (files) from the compendia is handled by o2r-contentbutler. To show a simple example implementation integrating both services, there is a additional compose file.

```
cd docker-compose && docker-compose -f docker-compose.full.yml up
# after you're done, shutdown and delete all volumes (data):
docker-compose -f docker-compose.full.yml down -v
```
## Testing

Needs a completely new environment (empty database), preferably startet with the docker-compose files.

```
npm install
npm install -g mocha
docker-compose -f docker-compose/docker-compose.yml up -d
sleep 10
mocha
docker-compose -f docker-compose/docker-compose.yml down -v

```

## License

o2r muncher is licensed under Apache License, Version 2.0, see file LICENSE.

Copyright (C) 2016 - o2r project.
