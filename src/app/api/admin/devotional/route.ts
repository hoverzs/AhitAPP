import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import {
  saveDevotionalAdminEdit,
  saveDevotionalDraft,
  saveDevotionalPexelsImage,
  saveDevotionalImageKeywords,
  clearDevotionalImage,
  updateDevotionalStatus,
  getDevotionalByDay,
} from "@/lib/devotionals";
import { isHeroImageUrl } from "@/lib/image-assets";
import {
  autoAssignPexelsToDevotional,
} from "@/lib/devotional-image";
import {
  buildFullDevotionalFromEditable,
  type EditableDevotionalFields,
  parseEditableFields,
} from "@/lib/devotional-fields";
import type { DevotionalStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type AdminAction =
  | "save"
  | "save_draft"
  | "approve"
  | "publish"
  | "revert_draft"
  | "select_pexels_image"
  | "save_image_keywords"
  | "remove_image"
  | "auto_select_pexels";

interface PexelsImageSelection {
  imageUrl: string;
  imageCredit: string;
  imagePhotographerUrl: string;
  pexelsPhotoId?: number;
}

interface AdminDevotionalBody {
  dayNumber: number;
  action: AdminAction;
  fields?: Partial<EditableDevotionalFields>;
  patch?: Partial<EditableDevotionalFields>;
  image?: PexelsImageSelection;
  imageKeywords?: string;
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });
  }

  let body: AdminDevotionalBody;
  try {
    body = (await request.json()) as AdminDevotionalBody;
  } catch {
    return NextResponse.json({ error: "Érvénytelen JSON." }, { status: 400 });
  }

  const { dayNumber, action } = body;

  if (!Number.isFinite(dayNumber) || dayNumber < 1) {
    return NextResponse.json({ error: "Érvénytelen dayNumber." }, { status: 400 });
  }

  try {
    let devotional;

    switch (action) {
      case "save":
      case "save_draft": {
        const input = body.fields ?? body.patch;
        if (!input) {
          return NextResponse.json({ error: "Hiányzó mezők." }, { status: 400 });
        }

        const existing = await getDevotionalByDay(dayNumber);
        if (!existing) {
          return NextResponse.json({ error: "Nem található." }, { status: 404 });
        }

        const parsed = parseEditableFields(existing);
        const merged: EditableDevotionalFields = {
          title: input.title ?? parsed.title,
          verse: input.verse ?? parsed.verse,
          meditation: input.meditation ?? parsed.meditation,
          prayer: input.prayer ?? parsed.prayer,
          reflectionQuestion: input.reflectionQuestion ?? parsed.reflectionQuestion,
          facebookCopy: input.facebookCopy ?? parsed.facebookCopy,
          category: input.category ?? parsed.category,
        };

        const built = buildFullDevotionalFromEditable(merged);

        if (action === "save_draft") {
          devotional = await saveDevotionalDraft(dayNumber, {
            title: merged.title,
            verse: built.verse,
            content: built.content,
            prayer: built.prayer,
            reflectionQuestion: built.reflectionQuestion,
            facebookCopy: merged.facebookCopy,
            category: merged.category,
          });
        } else {
          devotional = await saveDevotionalAdminEdit(dayNumber, {
            title: merged.title,
            verse: built.verse,
            content: built.content,
            prayer: built.prayer,
            reflectionQuestion: built.reflectionQuestion,
            facebookCopy: merged.facebookCopy,
            category: merged.category,
          });
        }
        break;
      }
      case "approve":
        devotional = await updateDevotionalStatus(dayNumber, "approved");
        break;
      case "publish":
        devotional = await updateDevotionalStatus(dayNumber, "published");
        break;
      case "revert_draft":
        devotional = await updateDevotionalStatus(dayNumber, "draft");
        break;
      case "select_pexels_image": {
        const image = body.image;
        if (
          !image?.imageUrl?.trim() ||
          !image.imageCredit?.trim() ||
          !image.imagePhotographerUrl?.trim()
        ) {
          return NextResponse.json({ error: "Hiányzó kép adatok." }, { status: 400 });
        }
        if (isHeroImageUrl(image.imageUrl)) {
          return NextResponse.json(
            { error: "A header/hero kép nem használható áhítat illusztrációként." },
            { status: 400 }
          );
        }
        devotional = await saveDevotionalPexelsImage(dayNumber, {
          imageUrl: image.imageUrl,
          imageCredit: image.imageCredit,
          imagePhotographerUrl: image.imagePhotographerUrl,
          pexelsPhotoId: image.pexelsPhotoId,
        });
        break;
      }
      case "save_image_keywords": {
        if (typeof body.imageKeywords !== "string") {
          return NextResponse.json({ error: "Hiányzó imageKeywords." }, { status: 400 });
        }
        devotional = await saveDevotionalImageKeywords(dayNumber, body.imageKeywords);
        break;
      }
      case "remove_image":
        devotional = await clearDevotionalImage(dayNumber);
        break;
      case "auto_select_pexels": {
        const existing = await getDevotionalByDay(dayNumber);
        if (!existing) {
          return NextResponse.json({ error: "Nem található." }, { status: 404 });
        }

        const result = await autoAssignPexelsToDevotional(existing);

        if (!result.assigned || !result.imageUrl) {
          return NextResponse.json(
            {
              error: "Nem található megfelelő Pexels kép.",
              hint: "Próbálj manuális keresést vagy tölts fel saját képet.",
            },
            { status: 404 }
          );
        }

        if (isHeroImageUrl(result.imageUrl)) {
          return NextResponse.json({ error: "Érvénytelen kép URL." }, { status: 400 });
        }

        devotional = await saveDevotionalPexelsImage(
          dayNumber,
          {
            imageUrl: result.imageUrl,
            imageCredit: result.imageCredit!,
            imagePhotographerUrl: result.imagePhotographerUrl!,
            pexelsPhotoId: result.pexelsPhotoId,
          },
          { source: result.imageSource === "pexels_auto" ? "pexels_auto" : "pexels" }
        );
        break;
      }
      default:
        return NextResponse.json({ error: "Ismeretlen művelet." }, { status: 400 });
    }

    return NextResponse.json({
      devotional,
      status: devotional.status as DevotionalStatus,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Művelet sikertelen.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
