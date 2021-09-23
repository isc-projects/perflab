FROM mongo

ADD init.js /docker-entrypoint-initdb.d/

HEALTHCHECK --interval=5s --start-period=10s CMD mongo test
