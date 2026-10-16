IMAGE ?= researcher-dashboard-runner
PLATFORM ?= linux/arm64
PORT ?= 8080

# package.json's version, read with sed because not every shell that runs make has Node.
VERSION ?= $(shell sed -n 's/^  "version": "\(.*\)",$$/\1/p' package.json)
ifeq ($(strip $(VERSION)),)
$(error VERSION is empty: package.json has no version line, and none was given)
endif
ARTIFACT ?= dist/runner-$(VERSION).zip
ARTIFACT_BUCKET ?= concord-devops
ARTIFACT_PREFIX ?= researcher-dashboard-runner
ARTIFACT_KEY = $(ARTIFACT_PREFIX)/$(notdir $(ARTIFACT))
ARTIFACT_URI = s3://$(ARTIFACT_BUCKET)/$(ARTIFACT_KEY)

.PHONY: build run tools shell clean test test-emulator artifact artifact-key publish-artifact smoke-build smoke-image

build:
	docker buildx build --platform $(PLATFORM) --load -t $(IMAGE) .

# Prints the four tool versions the preflight asks for, from inside the image.
tools:
	docker run --rm --platform $(PLATFORM) $(IMAGE) sh -c '\
	  cc-data version; \
	  duckdb --version; \
	  python3.11 --version; \
	  node --version'

run:
	docker run --rm --platform $(PLATFORM) -p $(PORT):8080 $(IMAGE)

shell:
	docker run --rm -it --platform $(PLATFORM) $(IMAGE) bash

test:
	npm test

# The status writes against the Firestore and Auth emulators, which the default npm test
# skips. Load report-service's rules to check the runner's writes against them.
FIREBASE_PROJECT ?= demo-researcher-dashboard
test-emulator:
	firebase emulators:exec --only firestore,auth --project $(FIREBASE_PROJECT) \
	  'FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
	   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
	   GCLOUD_PROJECT=$(FIREBASE_PROJECT) \
	   npm test'

# Lambda builds the MicroVM image itself, so the artifact it consumes is the
# Dockerfile and its build context, not the image `build` produces locally.
artifact:
	rm -f $(ARTIFACT)
	mkdir -p $(dir $(ARTIFACT))
	zip -r $(ARTIFACT) Dockerfile package.json package-lock.json server

# The runner stack's CodeArtifactKey parameter (cloudformation/README.md).
artifact-key:
	@echo $(ARTIFACT_KEY)

# A conditional write, so a VERSION already published is refused even to a racing publisher:
# overwriting it changes no key, so no image is built now and the next build takes it unreviewed.
publish-artifact: artifact
	@if ! out=$$(aws s3api put-object --bucket $(ARTIFACT_BUCKET) --key $(ARTIFACT_KEY) \
	    --body $(ARTIFACT) --if-none-match '*' 2>&1); then \
	  if echo "$$out" | grep -q PreconditionFailed; then \
	    echo "$(ARTIFACT_URI) is already published; a release takes a VERSION never published before" >&2; \
	  else \
	    echo "$$out" >&2; \
	  fi; \
	  exit 1; \
	fi
	@echo "published $(ARTIFACT_URI)"

# The smoke gate (README.md): the smoke package's zip, and the package run inside the
# image against staging's report-server, which needs no stack.
smoke-build:
	node smoke/smoke.mjs build

smoke-image:
	$(if $(SMOKE_CLASS_ID),,$(error SMOKE_CLASS_ID is required: the smoke class's portal id))
	$(if $(SMOKE_CLASS_HASH),,$(error SMOKE_CLASS_HASH is required: the smoke class's hash))
	IMAGE=$(IMAGE) PLATFORM=$(PLATFORM) node smoke/smoke.mjs image --class-id $(SMOKE_CLASS_ID) --class-hash $(SMOKE_CLASS_HASH)

clean:
	docker image rm $(IMAGE) || true
	rm -rf dist smoke/dist
