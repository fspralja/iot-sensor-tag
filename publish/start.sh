#!/bin/bash

sudo node sensor-tag.js > output.log 2>&1 &

less -W +F output.log

