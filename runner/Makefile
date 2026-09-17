IMAGE ?= researcher-dashboard-runner
PLATFORM ?= linux/arm64
PORT ?= 8080

VERSION ?= 0.1.0
ARTIFACT ?= dist/runner-$(VERSION).zip
ARTIFACT_BUCKET ?= concord-devops
ARTIFACT_PREFIX ?= researcher-dashboard-runner
ARTIFACT_URI = s3://$(ARTIFACT_BUCKET)/$(ARTIFACT_PREFIX)/$(notdir $(ARTIFACT))

.PHONY: build run tools shell clean test test-emulator run-hook artifact artifact-uri publish-artifact

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

# Status doc writes against real Firestore and Auth, which the default `npm test`
# skips so it stays hermetic. Rules arrive with the report-service work; until then
# this proves the document shapes and the custom-token sign-in.
FIREBASE_PROJECT ?= demo-researcher-dashboard
test-emulator:
	firebase emulators:exec --only firestore,auth --project $(FIREBASE_PROJECT) \
	  'FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
	   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
	   GCLOUD_PROJECT=$(FIREBASE_PROJECT) \
	   npm test'

# Drives one hook against a locally running server. DIR mode keeps the status docs
# in memory and syncs to a directory, so the whole lifecycle runs with no AWS
# account and no Firebase project:
#   SYNC_BACKEND=DIR SYNC_DIR=/tmp/rd DATA_ROOT=/tmp/rd-data npm start
#   make run-hook HOOK=run
#   make run-hook HOOK=suspend
HOOK ?= run
RUN_PAYLOAD ?= {"session_token":"local","platform_user_id":"439","portal":"learn_portal_staging_concord_org","firebase_project":"report-service-dev","bucket":"local","secret_name":"local"}
run-hook:
	@if [ "$(HOOK)" = "run" ]; then \
	  curl -fsS -X POST "http://127.0.0.1:$(PORT)/aws/lambda-microvms/runtime/v1/run" \
	    -H 'Content-Type: application/json' \
	    -d '{"microvmId":"mvm-local","runHookPayload":"$(subst ",\",$(RUN_PAYLOAD))"}'; \
	else \
	  curl -fsS -X POST "http://127.0.0.1:$(PORT)/aws/lambda-microvms/runtime/v1/$(HOOK)"; \
	fi
	@echo

# Lambda builds the MicroVM image itself, so the artifact it consumes is the
# Dockerfile and its build context, not the image `build` produces locally.
artifact:
	rm -f $(ARTIFACT)
	mkdir -p $(dir $(ARTIFACT))
	zip -r $(ARTIFACT) Dockerfile package.json package-lock.json server

# The CodeArtifactKey in cloud-formation's create-stack config must match this.
artifact-uri:
	@echo $(ARTIFACT_URI)

publish-artifact: artifact
	aws s3 cp $(ARTIFACT) $(ARTIFACT_URI)

clean:
	docker image rm $(IMAGE) || true
	rm -rf dist
