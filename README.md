# o2r muncher

[![Run tests](https://github.com/nuest/o2r-muncher/actions/workflows/tests.yml/badge.svg?branch=master)](https://github.com/nuest/o2r-muncher/actions/workflows/tests.yml) [![](https://images.microbadger.com/badges/image/o2rproject/o2r-muncher.svg)](https://microbadger.com/images/o2rproject/o2r-muncher "Get your own image badge on microbadger.com") [![](https://images.microbadger.com/badges/version/o2rproject/o2r-muncher.svg)](https://microbadger.com/images/o2rproject/o2r-muncher "Get your own version badge on microbadger.com")

Node.js implementation of endpoints of the [o2r API](https://o2r.info/api/) to load compendia from third party repositories, handle direct user uploads, and execute research compendia.

- `/api/` and `/api/v1/` (index of endpoints)
- `/api/v1/compendium` (reading and metadata update)
- `/api/v1/job` (execution of compendia)
- `/api/v1/substitution` (combining compendia)
- `/api/v1/environment` (computing environment metadata)

Requirements:

- Docker
- MongoDB
- Node.js `>=8`
- bagit-python (`bagit.py`)
- Docker socket access for running o2r-meta
- unzip
- wget

## Supported repositories

- Sciebo (https://sciebo.de)
- Zenodo or Zenodo Sandbox (https://zenodo.org or https://sandbox.zenodo.org)

## Run

This project includes a `Dockerfile` which can be built and run with the following commands.

```bash
docker build -t muncher .

docker run --name mongodb -d -p 27017:27017 mongo:3.4

docker run -it -p 8080:8080 --link mongodb:mongodb -v /var/run/docker.sock:/var/run/docker.sock -e MUNCHER_MONGODB=mongodb://mongodb:27017 -e DEBUG=muncher,muncher:* muncher
```

## Configuration

You can override these environment variables (configured in `config/config.js`) when starting the service to configure it.

- `MUNCHER_PORT`
  Define on which Port muncher should listen. Defaults to `8080`.
- `MUNCHER_MONGODB` __Required__
  Location for the mongo db. Defaults to `mongodb://localhost:27017/`. You will very likely need to change this.
- `MUNCHER_MONGODB_DATABASE`
  Which database inside the MongoDB should be used? Defaults to `muncher`.
- `MUNCHER_BASEPATH`
  Base path for the compendia storage. Defaults to `/tmp/o2r`. If you want persistent compendia storage, you should point this to a separate volume.
- `MUNCHER_VOLUME`
  The name of the volume where compendia are stored, needed for mounting the correct path to 2nd level containers in compose configurations; overrides `MUNCHER_BASEPATH` for the metadata tools containers. Not set by default.
- `MUNCHER_CONTAINER_USER`
  User name or id for the user running the compendium containers, defaults to `1000`. _Change this for usage with `docker-compose`!
- `MUNCHER_EMAIL_TRANSPORT`, `MUNCHER_EMAIL_RECEIVERS`, `MUNCHER_EMAIL_SENDER`
  Email configuration settings for sending emails when critical events in the server happen, based on [nodemailer](https://www.npmjs.com/package/nodemailer). `_TRANSPORT` ist the mail transport string, see nodemailer documented, `_RECEIVERS` is a comma-separated list, and `_SENDER` is the mails sender. All three must be set. Mail notification can also be disabled completely via `config.js`.
- `MUNCHER_META_TOOL_CONTAINER`
  Docker image name and tag for metadata tools, defaults to running latest [o2r-meta in a container](https://github.com/o2r-project/o2r-meta#using-docker), i.e. `o2rproject/o2r-meta:latest`.
- `MUNCHER_META_TOOL_CONTAINER_USER`
  User name or id for the [user](https://docs.docker.com/engine/reference/run/#user) running the meta container, defaults to `o2r`.
- `MUNCHER_META_TOOL_CONTAINER_RM`
  Remove the metadata extraction and brokering containers after completion, defaults to `true`.
- `MUNCHER_CONTAINERIT_IMAGE`
  Docker image name and tag for containerit tool, defaults to running Rocker's [geospatial](https://github.com/rocker-org/geospatial/) image with [containerit](https://github.com/o2r-project/containerit/) pre-installed, i.e. `o2rproject/containerit:geospatial`.
- `MUNCHER_CONTAINERIT_USER`
  The user within the container, which must match the used image (see previous setting), defaults to `rstudio`, which is suitable for images in the `rocker/verse` stack of images. _Change this_ when running muncher inside a container, or with `docker-compose`!
- `MUNCHER_CONTAINERIT_BASE_IMAGE`
  The base image to use for generated `Dockerfile`s.
- `MUNCHER_CONTAINERIT_FILTER_BASE_IMAGE_PKGS`
  Gives the `containerit` container access to the Docker socket so that it can extract the packages installed in a container and not install them redundantly, see also [related issue](https://github.com/o2r-project/o2r-muncher/issues/105). _Only works when running muncher inside a container_, or with `docker-compose`!
- `MUNCHER_FAIL_ON_NO_FILES`
  Should an error be thrown when files for a compendium that exists in the database are _not found_? Defaults to `false` (useful for testing).
- `MUNCHER_ALLOW_INVALID_METADATA`
  Should an error be return when invalid metadata is stored? Defaults to `false`.
- `MUNCHER_SAVE_IMAGE_TARBALL`
  Save the image tarball into the compendium after successful execution. Defaults to `true`, but useful to deactivate during development.
- `MUNCHER_META_TOOL_OFFLINE`
  Do not go online during metadata extraction to retrieve additional metadata, defaults to `false`.
- `SESSION_SECRET`
  String used to sign the session ID cookie, must match other microservices.
- `SLACK_BOT_TOKEN`
  Authentication token for a bot app on Slack. See section [Slack bot](#slack-bot).
- `SLACK_VERIFICATION_TOKEN`
  Token provided by Slack for interative messages and events, to be used to verify that requests are actually coming from Slack.
- `SLACK_CHANNEL_STATUS`
  Channel to post status messages to, defaults to `#monitoring`.
- `SLACK_CHANNEL_LOAD`
  Channel to post messages related to (up)loading to, defaults to `#monitoring`.

The connection to the Docker API is build on [dockerode](https://www.npmjs.com/package/dockerode) which allows execution on any Docker host that exposes the port.
Most commonly, the default configuration will be used, i.e. the local Docker socket is mounted at the default location into the container running muncher (see [above](#run))

## Slack bot

Documentation of Slack API: https://api.slack.com/bot-users, especially [interactive messages](https://api.slack.com/interactive-messages).

The bot needs the permissions to join channels and post to them.
Add the following scopes to the app in the section "OAuth & Permissions" in the bot's apps page.

- `channels:write`
- `chat:write:bot`
- `bot`

While adding the app to your Slack organisation, make sure to allow the bot to post the the desired channel.

### Local bot development

Start ngrok with `ngrok http 8088` and enter the public endpoint pointing to your local server at https://api.slack.com/apps/A6J6CDLQK/interactive-messages. ngrok also has a useful web interface at http://127.0.0.1:4040/inspect/http on all incoming requests.

## Supported encodings

The upload process may fail if certain files with unsupported encoding are detected: 

The encoding of text files analyzed by the o2r metadata extraction tool [o2r-meta](https://github.com/o2r-project/o2r-meta) must be Unicode (`UTF-8`, `UTF-16BE`, ...) or Unicode compatible (e.g. `ISO-8859-1`). The supported encodings and the list of files checked can be configured in `config.js`. 

## Testing

Testing is based on mocha integration tests.
A MongoDB database must be running at the default port for the tests to work and must be started manually.

**Attention:** The database is cleared completely several times during the tests!

```bash
# must start with replica set for oplog (finder) to work, see https://docs.mongodb.com/manual/tutorial/convert-standalone-to-replica-set/ and https://docs.mongodb.com/manual/tutorial/deploy-replica-set-for-testing/
mongod --dbpath ./db --replSet rso2r --smallfiles;

# run tests
npm test

# you can also run the tests towards a manually specified host
TEST_HOST=http://localhost:80 npm test

# stop tests after the first failing one
npm run test_bail

# run specific test file only
DEBUG=*,-modem,-mocha:* mocha --bail test/job-manifest.js

# only run tests matching a text until first fails
DEBUG=*,-modem,-mocha:* mocha --bail --grep manifest
```

The archives created to upload workspaces and compendia for testing are cached.
Be aware that when you edit files in test workspaces and compendia, you must manually delete the cached files, e.g. `/tmp/o2r-muncher-upload_<hash>.zip`.
You can use the hash to identify tests that use the same files on CI, as multiple tests may fail if one compendium/workspace is faulty.

To run single tests on CI (and thereby reducing the logs to only the ones of interest) you can comment out parts of the build matrix or overwrite only the required `run` command in an [interactive debug session](https://github.com/marketplace/actions/debugging-with-tmate).

```yml
script:
  - DEBUG=*,mocha:*,-modem mocha ./test/ --grep "<name of the test>"
```

### Public shares

The tests for public shares (`sciebo_erc.js`, `sciebo_workspace.js` and `zenodo.js`) use ERC uploaded to the respective services.

They can be found at

* Sciebo: [public link](https://uni-muenster.sciebo.de/index.php/s/h5tNYXsS1Bsv4qr) | [private link](https://uni-muenster.sciebo.de/f/749265161)
* Zenodo: https://sandbox.zenodo.org/deposit/69114

For information on which share URL belongs to which compendium, see the file `README` in the [`integration_test_shares`](https://uni-muenster.sciebo.de/index.php/s/h5tNYXsS1Bsv4qr) folder.

## Development

### Run container with MongoDB on host

```bash
docker run -it -p 8080:8080 -v /var/run/docker.sock:/var/run/docker.sock -e MUNCHER_MONGODB=mongodb://172.17.0.1:27017 -e DEBUG=muncher,muncher:* muncher
```

### Removing all containers/images created by muncher

```bash
docker ps -a | grep erc | awk '{print $1}' | xargs --no-run-if-empty docker rm

docker images --no-trunc | grep erc | awk '{print $3}' | xargs --no-run-if-empty docker rmi -f
```

### Steps for starting a local development environment _manually_

The following steps assume that you have all the required projects (`o2r-muncher`, `o2r-platform`) in one directory. Repository updates (`git pull`, `npm install`, etc.) are not shown.

```bash
mkdir /tmp/o2r-mongodb-data
mongod --dbpath /tmp/o2r-mongodb-data

# new terminal: start muncher (default port 8080)
cd ../o2r-muncher
DEBUG=* npm start

# new terminal: run tests to add test data
npm test

# new terminal: run a webservice container in daemon mode on port 80 with (a) a proxy in front of the microservices and (b) the client project at / (must change app constant manually!)
cd ../o2r-platform
docker run --rm --name o2r-platform -p 80:80 -v $(pwd)/test/nginx.conf:/etc/nginx/nginx.conf -v $(pwd):/etc/nginx/html nginx

# do work, restart respective apps as needed
```

Alternatively, start the component(s) under development from your IDE(s).

### Authentication and upload with curl

You can authenticate locally with OAuth via ORCID using the required configuration parameters (see project [reference-implementation](https://github.com/o2r-project/reference-implementation)).

If you want to upload from the command line, make sure the account has the required [level](https://o2r.info/api/user/#user-levels) (it should [by default](https://github.com/o2r-project/o2r-bouncer#available-environment-variables)), get the session cookie `connect.sid` content out of the browser and use it in the `curl` request:

```bash
curl --cookie connect.sid=s:S1oH7... -F "compendium=@/<path to compendium.zip>;type=application/zip" -F "content_type=compendium"
```

### Create bags for testing

The following code uses `bagit.py` to create, validate, or load and update an existing bag _in place_:

```bash
# create bag
python -c "import bagit; bag = bagit.make_bag('success-validate');"

# validate bag
python -c "import bagit; bag = bagit.Bag('success-load-validate'); print('Is Bag valid?', bag.validate());"

# update bag
python -c "import bagit; bag = bagit.Bag('success-load-validate'); bag.save(manifests=True);"
```

## Dockerfile

The file `Dockerfile` describes the Docker image published at [Docker Hub](https://hub.docker.com/r/o2rproject/o2r-muncher/).

```bash
docker build --tag muncher .

docker run --name mongodb -d -p 27017:27017 mongo:3.4
docker run --name testmuncher -d -p 8080:8080 --link mongodb:mongodb -v /tmp/o2r:/tmp/o2r -v /var/run/docker.sock:/var/run/docker.sock -e MUNCHER_MONGODB=mongodb://mongodb:27017 -e DEBUG=* o2rproject/o2r-muncher:latest
docker run --name testbouncer -d -p 8083:8083 --link mongodb:mongodb -v /tmp/o2r:/tmp/o2r -e BOUNCER_MONGODB=mongodb://mongodb:27017 -e DEBUG=* -e OAUTH_CLIENT_ID=... -e OAUTH_CLIENT_SECRET=... -e  OAUTH_URL_CALLBACK=http://localhost/api/v1/auth/login o2rproject/o2r-bouncer:latest
```

## License

o2r muncher is licensed under Apache License, Version 2.0, see file LICENSE.

Copyright (C) 2017 - o2r project.
