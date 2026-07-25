import { NextResponse } from "next/server";
import type { CsvImportProfile } from "@fantasyfb/expert-data";
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  authorizePrivateAccess
} from "../../../../server/auth/private-access";
import { stagePrivateExpertImport } from "../../../../server/expert-data";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await authorizePrivateAccess();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A CSV file is required." }, { status: 400 });
    }
    const seasonYear = Number(form.get("seasonYear"));
    if (!Number.isInteger(seasonYear) || seasonYear < 2007 || seasonYear > 2100) {
      return NextResponse.json({ error: "Season must be between 2007 and 2100." }, { status: 400 });
    }
    const providerName = String(form.get("providerName") ?? "").trim();
    if (!providerName) {
      return NextResponse.json({ error: "Provider name is required." }, { status: 400 });
    }
    const profile = parseProfile(form.get("profile"));
    const preview = await stagePrivateExpertImport({
      user,
      file,
      seasonYear,
      providerName,
      profile,
      preserveOriginal: form.get("preserveOriginal") === "true"
    });
    return NextResponse.json({ preview }, { status: 201 });
  } catch (error) {
    return privateRouteError(error);
  }
}

function parseProfile(value: FormDataEntryValue | null): CsvImportProfile {
  if (typeof value !== "string") throw new Error("An import profile is required.");
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object") throw new Error("Import profile must be an object.");
  return parsed as CsvImportProfile;
}

function privateRouteError(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (error instanceof AuthorizationDeniedError) {
    return NextResponse.json({ error: "GitHub account not authorized" }, { status: 403 });
  }
  if (error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  throw error;
}
