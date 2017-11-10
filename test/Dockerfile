FROM rocker/r-ver:3.4.2
LABEL maintainer="o2r"
RUN export DEBIAN_FRONTEND=noninteractive; apt-get -y update \
 && apt-get install -y git-core \
	pandoc \
	pandoc-citeproc
RUN ["install2.r", "-r 'https://cloud.r-project.org'", "knitr", "backports", "magrittr", "rprojroot", "htmltools", "yaml", "Rcpp", "stringi", "rmarkdown", "stringr", "digest", "evaluate"]