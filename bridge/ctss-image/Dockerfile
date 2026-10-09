# CTSS on the s709 IBM 7094 emulator with the ELIZA sources uploaded. Based
# on docker/Dockerfile in rupertl/eliza-ctss (CC0) by Steven Goodwin.
# One container = one IBM 7094 = one ELIZA line: the reconstructed CTSS is
# only reliable with a single ELIZA logged in, so run several containers for
# several simultaneous visitors. The bridge compiles SLIP and ELIZA inside
# CTSS on first boot; keep /home/ctss/eliza-ctss/dasd on a volume so that
# happens once.

FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends make gcc libc6-dev python3 git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -ms /bin/bash ctss
USER ctss
WORKDIR /home/ctss

ARG ELIZA_CTSS_REPO=https://github.com/rupertl/eliza-ctss.git
ARG ELIZA_CTSS_REF=main
RUN git clone --depth 1 --branch ${ELIZA_CTSS_REF} ${ELIZA_CTSS_REPO} eliza-ctss
WORKDIR /home/ctss/eliza-ctss

SHELL ["/bin/bash", "-c"]
RUN source env.sh \
 && make-binaries \
 && make-disks \
 && printf "\n\nquit\n" | format-disks \
 && printf "\n\n\n\nq\n" | install-disk-loader \
 && installctss \
 && add-eliza-users \
 && upload-all

EXPOSE 7094
# s709 wants a console on stdin: run with a tty (compose: tty: true, stdin_open: true)
CMD source env.sh && runctss
