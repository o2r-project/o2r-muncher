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
docker-compose up
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
