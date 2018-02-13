FROM alpine
MAINTAINER <http://o2r.info>

ENV HOST o2r.info
ENV SECONDS 3

RUN chmod u+s /bin/ping

CMD ping -w $SECONDS $HOST
