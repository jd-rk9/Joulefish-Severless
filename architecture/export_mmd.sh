#!/bin/bash

for file in *.mmd; do
  mmdc -i "$file" -o "${file%.mmd}.svg"
done