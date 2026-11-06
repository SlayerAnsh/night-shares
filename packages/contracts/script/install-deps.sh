#!/bin/sh
# Fetch immutable upstream snapshots without git or recursive submodules.
set -eu
cd "$(dirname "$0")/.."
mkdir -p lib
stage=$(mktemp -d "${TMPDIR:-/tmp}/night-shares-deps.XXXXXX")
cleanup() {
    python3 -c 'import shutil,sys; shutil.rmtree(sys.argv[1], ignore_errors=True)' "$stage"
}
trap cleanup EXIT HUP INT TERM

fetch() {
    dest=$1 repo=$2 commit=$3 subtree=$4
    if [ -f "$dest/.pinned-commit" ] && [ "$(cat "$dest/.pinned-commit")" = "$commit" ] && [ -d "$dest/$subtree" ]; then
        printf 'Already installed %s @ %s\n' "$repo" "$commit"
        return
    fi
    printf 'Fetching %s @ %s\n' "$repo" "$commit"
    python3 -c 'import shutil,sys; [shutil.rmtree(p, ignore_errors=True) for p in sys.argv[1:]]' "$stage/unpack" "$stage/keep"
    mkdir -p "$stage/unpack" "$stage/keep"
    curl --fail --location --retry 3 --silent --show-error \
        "https://codeload.github.com/$repo/tar.gz/$commit" -o "$stage/archive.tar.gz"
    tar -xzf "$stage/archive.tar.gz" --strip-components=1 -C "$stage/unpack"
    mkdir -p "$stage/keep/$(dirname "$subtree")"
    cp -R "$stage/unpack/$subtree" "$stage/keep/$subtree"
    for license in "$stage/unpack"/LICENSE* "$stage/unpack"/COPYING*; do
        [ ! -f "$license" ] || cp "$license" "$stage/keep/"
    done
    printf '%s\n' "$commit" > "$stage/keep/.pinned-commit"
    mkdir -p "$(dirname "$dest")"
    python3 -c 'import shutil,sys; shutil.rmtree(sys.argv[1], ignore_errors=True)' "$dest"
    mv "$stage/keep" "$dest"
}

fetch lib/v4-core Uniswap/v4-core bea7f6d1c11cd5dc4f0d5151ffa37a1c239feee6 src
fetch lib/v4-core/lib/forge-std foundry-rs/forge-std 1de6eecf821de7fe2c908cc48d3ab3dced20717f src
fetch lib/v4-core/lib/solmate transmissions11/solmate 4b47a19038b798b4a33d9749d25e570443520647 src
fetch lib/solady Vectorized/solady 258f67cc71e39cff307b726939ade17e9d8bcf5c src
fetch lib/permit2 Uniswap/permit2 cc56ad0f3439c502c246fc5cfcc3db92bb8b7219 src/interfaces
