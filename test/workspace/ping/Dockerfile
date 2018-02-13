FROM alpine
MAINTAINER <http://o2r.info>

ENV HOST 127.0.0.1
ENV SECONDS 3

RUN chmod u+s /bin/ping

CMD ping -w $SECONDS $HOST
