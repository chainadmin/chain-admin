import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handleLoginResult,
  retryLoginWithAgencySelection,
  storeAgencyContext,
  type AgencyContext,
  type ConsumerLoginResult,
  type LoginMutationPayload,
  type LoginForm,
} from "../consumer-login-helpers";

test("selecting an agency persists the choice before retrying login", async () => {
  const chosenAgency: AgencyContext = {
    slug: "alpha-agency",
    name: "Alpha Agency",
    logoUrl: null,
  };

  const form: LoginForm = {
    email: "alpha@example.com",
    dateOfBirth: "2000-01-01",
  };

  const events: string[] = [];

  const mutateCalls: LoginMutationPayload[] = [];
  const mutateAsync = async (payload: LoginMutationPayload) => {
    events.push("mutate");
    mutateCalls.push(payload);
  };

  const persistContext = () => {
    events.push("persist");
  };

  await retryLoginWithAgencySelection(chosenAgency, form, mutateAsync, persistContext);

  assert.deepEqual(events, ["persist", "mutate"], "agency context should be persisted before retrying login");
  assert.deepEqual(mutateCalls, [
    {
      email: form.email,
      dateOfBirth: form.dateOfBirth,
      tenantSlug: chosenAgency.slug,
    },
  ]);
});

test("agency context is written to both storage layers when available", () => {
  const storedValues: Record<string, string[]> = {
    session: [],
    local: [],
  };

  const sessionStorage = {
    setItem: (key: string, value: string) => {
      storedValues.session.push(`${key}:${value}`);
    },
  };

  const localStorage = {
    setItem: (key: string, value: string) => {
      storedValues.local.push(`${key}:${value}`);
    },
  };

  const agency: AgencyContext = {
    slug: "bravo",
    name: "Bravo Agency",
    logoUrl: "https://example.com/logo.png",
  };

  storeAgencyContext(agency, { session: sessionStorage, local: localStorage });

  const serialized = JSON.stringify(agency);
  assert.deepEqual(storedValues.session, [`agencyContext:${serialized}`]);
  assert.deepEqual(storedValues.local, [`agencyContext:${serialized}`]);
});

test("handleLoginResult routes 409 responses requiring agency link", () => {
  const toastCalls: unknown[] = [];
  const pendingAgencies: AgencyContext[][] = [];
  const dialogStates: boolean[] = [];
  const locations: string[] = [];

  const payload: ConsumerLoginResult = {
    message: "Your account needs to be linked to an agency. Please complete registration.",
    needsAgencyLink: true,
  };

  const handled = handleLoginResult(payload, {
    email: "user@example.com",
    showToast: options => {
      toastCalls.push(options);
    },
    setPendingAgencies: agencies => {
      pendingAgencies.push(agencies);
    },
    setAgencyDialogOpen: open => {
      dialogStates.push(open);
    },
    setLocation: path => {
      locations.push(path);
    },
  });

  assert.equal(handled, true, "409 payloads should be handled by the helper");
  assert.deepEqual(pendingAgencies, [], "no agencies should be queued for selection");
  assert.deepEqual(dialogStates, [], "dialog should not open for agency link flow");
  assert.deepEqual(locations, ["/consumer-register?email=user@example.com"]);
  assert.deepEqual(toastCalls, [
    {
      title: "Agency Link Required",
      description: payload.message,
    },
  ]);
});
