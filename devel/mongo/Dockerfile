FROM docker.io/library/mongo:4

ADD init.js /docker-entrypoint-initdb.d/

HEALTHCHECK --interval=5s --start-period=10s CMD mongo test
