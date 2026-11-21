import { useEffect, useRef, useState } from "react";
import { Camera, Check, ImageUp, Loader2, Pencil, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { addFridgeItemsBatch, recognizeIngredients } from "@/integrations/api/hooks";
import type { UnitType } from "@/integrations/api/types";

const UNITS: UnitType[] = ["piece", "g", "kg", "ml", "l", "cup", "tbsp", "tsp", "slice", "serving"];
// Phone photos are 5-10 MB; the AI only looks at 768 px, so send ~1280 px
const MAX_SIDE = 1280;
// After this long the AI is probably waking up
const SLOW_MS = 12_000;

type Item = {
  key: number;
  name: string;
  name_uk: string;
  confidence: "high" | "medium" | "low";
  food_id: string | null;
  selected: boolean;
  editing: boolean;
  quantity: string;
  unit: UnitType;
  expiry: string;
};

// Downscales in the browser (keeping the camera's rotation) before upload
async function photoToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function AiScanTab({ onSaved }: { onSaved: () => void }) {
  const { t, lang } = useI18n();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "recognizing" | "results" | "saving">("idle");
  const [slow, setSlow] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [foundCount, setFoundCount] = useState(0);

  useEffect(() => {
    if (status !== "recognizing") {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, [status]);

  // The name shown and edited follows the interface language. The AI answers
  // in lowercase ("tomato"); the food database capitalises ("Tomato").
  const nameOf = (item: Item) => {
    const name = lang === "uk" ? item.name_uk || item.name : item.name;
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  const scan = async (file: File | undefined) => {
    if (!file) return;
    let image: string;
    try {
      image = await photoToDataUrl(file);
    } catch {
      toast.error(t("aiScan.badImage"));
      return;
    }
    setPhoto(image);
    setStatus("recognizing");
    try {
      const found = await recognizeIngredients(image);
      setFoundCount(found.length);
      setItems(
        found.map((f, i) => ({
          key: i,
          name: f.name,
          name_uk: f.name_uk,
          confidence: f.confidence,
          food_id: f.food_id,
          // Guesses must be confirmed by hand
          selected: f.confidence !== "low",
          editing: false,
          quantity: "",
          unit: "piece",
          expiry: "",
        }))
      );
      setStatus("results");
    } catch {
      toast.error(t("aiScan.error"));
      setStatus("idle");
    }
  };

  const update = (key: number, patch: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  // A renamed item no longer matches the food the AI linked it to
  const rename = (item: Item, value: string) =>
    update(item.key, { food_id: null, ...(lang === "uk" ? { name_uk: value } : { name: value }) });

  const restart = () => {
    setPhoto(null);
    setItems([]);
    setStatus("idle");
  };

  const chosen = items.filter((it) => it.selected && nameOf(it).trim());

  const save = async () => {
    setStatus("saving");
    try {
      await addFridgeItemsBatch(
        chosen.map((it) => ({
          food_id: it.food_id,
          name: (it.name || it.name_uk).trim(),
          name_uk: it.name_uk?.trim() || null,
          quantity: it.quantity ? Number(it.quantity) : null,
          unit: it.unit,
          expiry_date: it.expiry || null,
        }))
      );
      toast.success(t("aiScan.saved", { count: chosen.length }));
      onSaved();
    } catch {
      toast.error(t("aiScan.saveError"));
      setStatus("results");
    }
  };

  const fileInputs = (
    <>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { scan(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { scan(e.target.files?.[0]); e.target.value = ""; }} />
    </>
  );

  if (status === "idle") {
    return (
      <div className="space-y-4">
        {fileInputs}
        <div className="flex items-start gap-3 rounded-xl bg-primary/5 p-4 text-sm text-muted-foreground">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          {t("aiScan.intro")}
        </div>
        <Button className="h-12 w-full" onClick={() => cameraRef.current?.click()}>
          <Camera /> {t("aiScan.takePhoto")}
        </Button>
        <Button variant="outline" className="w-full" onClick={() => galleryRef.current?.click()}>
          <ImageUp /> {t("aiScan.fromGallery")}
        </Button>
      </div>
    );
  }

  if (status === "recognizing") {
    return (
      <div className="space-y-4 text-center">
        {photo && <img src={photo} alt="" className="mx-auto max-h-48 rounded-xl object-cover opacity-70" />}
        <div className="flex items-center justify-center gap-2 text-sm font-medium">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("aiScan.recognizing")}
        </div>
        {slow && <p className="text-xs text-muted-foreground">{t("aiScan.slow")}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {fileInputs}
      <div className="flex items-center gap-3">
        {photo && <img src={photo} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />}
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t("aiScan.found", { count: foundCount })}</p>
          {items.length > 0 && <p className="text-xs text-muted-foreground">{t("aiScan.hint")}</p>}
        </div>
      </div>

      {foundCount === 0 ? (
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{t("aiScan.nothing")}</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{t("aiScan.allRemoved")}</p>
      ) : (
        <ul className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
          {items.map((item) => {
            const name = nameOf(item);
            return (
              <li
                key={item.key}
                data-scan-item={item.name}
                className={cn("rounded-xl border p-3 transition", item.selected ? "border-primary/40 bg-primary/5" : "border-border")}
              >
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={item.selected}
                    onCheckedChange={(v) => update(item.key, { selected: !!v })}
                    aria-label={t("aiScan.select", { name })}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{name || "—"}</div>
                    <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                      {item.quantity && <span>{item.quantity} {t(`unit.${item.unit}`)}</span>}
                      {item.confidence === "low" && <span className="font-medium text-warning-foreground">{t("aiScan.unsure")}</span>}
                      {!item.food_id && <span>{t("aiScan.newFood")}</span>}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => update(item.key, { editing: !item.editing })}
                    aria-label={item.editing ? t("aiScan.done") : t("aiScan.edit")}
                  >
                    {item.editing ? <Check /> : <Pencil />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setItems((list) => list.filter((it) => it.key !== item.key))}
                    aria-label={t("aiScan.remove", { name })}
                  >
                    <Trash2 />
                  </Button>
                </div>

                {item.editing && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <Label className="text-xs">{t("addIng.name")}</Label>
                      <Input className="mt-1" value={name} onChange={(e) => rename(item, e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">{t("addIng.quantity")}</Label>
                      <Input className="mt-1" type="number" inputMode="decimal" min={0} value={item.quantity}
                        onChange={(e) => update(item.key, { quantity: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">{t("addIng.unit")}</Label>
                      <Select value={item.unit} onValueChange={(v) => update(item.key, { unit: v as UnitType })}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {UNITS.map((u) => <SelectItem key={u} value={u}>{t(`unit.${u}`)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">{t("addIng.expiry")}</Label>
                      <Input className="mt-1" type="date" value={item.expiry}
                        onChange={(e) => update(item.key, { expiry: e.target.value })} />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-2 pt-1">
        {chosen.length > 0 && (
          <Button onClick={save} disabled={status === "saving"}>
            {status === "saving" ? <Loader2 className="animate-spin" /> : <Check />}
            {status === "saving" ? t("aiScan.saving") : t("aiScan.save", { count: chosen.length })}
          </Button>
        )}
        <Button variant="outline" onClick={restart} disabled={status === "saving"}>
          <RotateCcw /> {t("aiScan.another")}
        </Button>
      </div>
    </div>
  );
}
