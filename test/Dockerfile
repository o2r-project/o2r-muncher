# A "test warming" Dockerfile that installs dependencies from test workspaces
# base image here must match config.containerit.baseImage
FROM rocker/geospatial:3.6.2
LABEL maintainer="o2r"
RUN export DEBIAN_FRONTEND=noninteractive; apt-get -y update \
 && apt-get install -y git-core \
	pandoc \
	pandoc-citeproc
RUN ["install2.r", "backports", "digest", "evaluate", "htmltools", "knitr", "magrittr", "Rcpp", "rmarkdown", "rprojroot", "stringi", "stringr", "yaml"]
