#!/usr/bin/env bash
cd "$(dirname "$0")"
grep -v " SHA256SUMS.txt$" SHA256SUMS.txt | grep -v " verificar_sha256" | grep -v " VERIFICAR_SHA256" | sha256sum -c -
