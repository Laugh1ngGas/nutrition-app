import { useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Barcode, Loader2, Plus, Search, Sparkles } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { AiScanTab } from "./AiScanTab";
import {
  useFoodSearch,
  getFoodByBarcode,
  createFood,
  addFridgeItem,
} from "@/integrations/api/hooks";
import type { Food, UnitType } from "@/integrations/api/types";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

const UNIT_OPTIONS: UnitType[] = ["g", "kg", "ml", "l", "cup", "tbsp", "tsp", "piece", "slice", "serving"];

type Step = "pick" | "create" | "details";

type NewFoodForm = {
  name: string;
  category: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
};

const EMPTY_NEW_FOOD: NewFoodForm = { name: "", category: "", calories: "", protein_g: "", carbs_g: "", fat_g: "" };

export function AddIngredientDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdded: () => void;
}) {
  const { t } = useI18n();
  // Camera features (barcode, AI photo scan) only on phones; desktop searches
  const isMobile = useIsMobile();
  const [mode, setMode] = useState<"search" | "scan" | "ai">("search");
  const [step, setStep] = useState<Step>("pick");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [prefillBarcode, setPrefillBarcode] = useState("");
  const [newFood, setNewFood] = useState<NewFoodForm>(EMPTY_NEW_FOOD);
  const [creatingFood, setCreatingFood] = useState(false);

  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<UnitType>("g");
  const [expiryDate, setExpiryDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: results, isLoading: searching } = useFoodSearch(debouncedQuery);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setMode("search");
      setStep("pick");
      setQuery("");
      setDebouncedQuery("");
      setSelectedFood(null);
      setPrefillBarcode("");
      setNewFood(EMPTY_NEW_FOOD);
      setQuantity("");
      setUnit("g");
      setExpiryDate("");
    }
  }, [open]);

  const pickFood = (food: Food) => {
    setSelectedFood(food);
    setStep("details");
  };

  const startCreateNew = (barcode?: string) => {
    setPrefillBarcode(barcode || "");
    setNewFood((f) => ({ ...f, name: barcode ? f.name : query }));
    setStep("create");
  };

  const handleBarcodeDetected = async (barcode: string) => {
    try {
      const food = await getFoodByBarcode(barcode);
      pickFood(food);
    } catch {
      startCreateNew(barcode);
    }
  };

  const submitNewFood = async () => {
    if (!newFood.name.trim()) {
      toast.error(t("addIng.nameRequired"));
      return;
    }
    setCreatingFood(true);
    try {
      const food = await createFood({
        name: newFood.name.trim(),
        category: newFood.category || undefined,
        barcode: prefillBarcode || undefined,
        calories: newFood.calories ? Number(newFood.calories) : 0,
        protein_g: newFood.protein_g ? Number(newFood.protein_g) : undefined,
        carbs_g: newFood.carbs_g ? Number(newFood.carbs_g) : undefined,
        fat_g: newFood.fat_g ? Number(newFood.fat_g) : undefined,
      });
      setSelectedFood(food);
      setStep("details");
    } catch {
      toast.error(t("addIng.createError"));
    } finally {
      setCreatingFood(false);
    }
  };

  const submitAdd = async () => {
    if (!selectedFood) return;
    setSubmitting(true);
    try {
      await addFridgeItem({
        food_id: selectedFood.id,
        quantity: quantity ? Number(quantity) : undefined,
        unit,
        expiry_date: expiryDate || undefined,
      });
      toast.success(t("addIng.added", { name: selectedFood.name }));
      onAdded();
      onOpenChange(false);
    } catch {
      toast.error(t("addIng.addError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("addIng.title")}</DialogTitle>
        </DialogHeader>

        {step === "pick" && !isMobile && (
          <SearchTab
            query={query}
            setQuery={setQuery}
            results={results ?? []}
            loading={searching}
            onPick={pickFood}
            onCreateNew={() => startCreateNew()}
          />
        )}

        {step === "pick" && isMobile && (
          <Tabs value={mode} onValueChange={(v) => setMode(v as "search" | "scan" | "ai")}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="search"><Search className="h-4 w-4" /> {t("addIng.search")}</TabsTrigger>
              <TabsTrigger value="scan"><Barcode className="h-4 w-4" /> {t("addIng.barcodeShort")}</TabsTrigger>
              <TabsTrigger value="ai"><Sparkles className="h-4 w-4" /> {t("addIng.aiScan")}</TabsTrigger>
            </TabsList>

            <TabsContent value="search" className="mt-4">
              <SearchTab
                query={query}
                setQuery={setQuery}
                results={results ?? []}
                loading={searching}
                onPick={pickFood}
                onCreateNew={() => startCreateNew()}
              />
            </TabsContent>

            <TabsContent value="scan" className="mt-4">
              <ScanTab onDetected={handleBarcodeDetected} />
            </TabsContent>

            <TabsContent value="ai" className="mt-4">
              <AiScanTab
                onSaved={() => {
                  onAdded();
                  onOpenChange(false);
                }}
              />
            </TabsContent>
          </Tabs>
        )}

        {step === "create" && (
          <>
            <CreateFoodStep newFood={newFood} setNewFood={setNewFood} barcode={prefillBarcode} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("pick")}>{t("common.cancel")}</Button>
              <Button onClick={submitNewFood} disabled={creatingFood}>
                {creatingFood ? <Loader2 className="h-4 w-4 animate-spin" /> : t("addIng.createContinue")}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "details" && selectedFood && (
          <>
            <DetailsStep
              food={selectedFood}
              quantity={quantity}
              setQuantity={setQuantity}
              unit={unit}
              setUnit={setUnit}
              expiryDate={expiryDate}
              setExpiryDate={setExpiryDate}
              onBack={() => { setStep("pick"); setSelectedFood(null); }}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => { setStep("pick"); setSelectedFood(null); }}>{t("common.back")}</Button>
              <Button onClick={submitAdd} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("addIng.addToFridge")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SearchTab({
  query,
  setQuery,
  results,
  loading,
  onPick,
  onCreateNew,
}: {
  query: string;
  setQuery: (v: string) => void;
  results: Food[];
  loading: boolean;
  onPick: (f: Food) => void;
  onCreateNew: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <Input
          className="pl-9"
          placeholder={t("addIng.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      <div className="max-h-64 overflow-y-auto rounded-md border border-border">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("addIng.searching")}
          </div>
        ) : query.trim().length < 2 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">{t("addIng.typeMore")}</div>
        ) : results.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">{t("addIng.noMatches", { q: query })}</div>
        ) : (
          <ul>
            {results.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onPick(f)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span>
                    <span className="font-medium">{f.name}</span>
                    {f.brand && <span className="text-muted-foreground"> · {f.brand}</span>}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">{t("addIng.per100", { kcal: Number(f.calories) })}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {query.trim().length >= 2 && (
        <Button type="button" variant="outline" className="w-full" onClick={onCreateNew}>
          <Plus className="h-4 w-4" /> {t("addIng.createNew", { q: query })}
        </Button>
      )}
    </div>
  );
}

function ScanTab({ onDetected }: { onDetected: (barcode: string) => void }) {
  const { t } = useI18n();
  const regionId = useId();
  const domId = `barcode-region-${regionId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const detectedRef = useRef(false);
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<"addIng.cameraDenied" | "addIng.cameraFailed" | null>(null);

  useEffect(() => {
    detectedRef.current = false;
    const scanner = new Html5Qrcode(domId, {
      verbose: false,
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128,
      ],
    });
    scannerRef.current = scanner;
    setStarting(true);
    setError(null);

    scanner
      .start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 150 },
        },
        (decodedText) => {
          if (detectedRef.current) return;
          detectedRef.current = true;
          onDetected(decodedText);
        },
        () => { /* per-frame decode misses are expected, ignore */ }
      )
      .then(() => setStarting(false))
      .catch((err: unknown) => {
        setStarting(false);
        const msg = err instanceof Error ? err.message : String(err);
        setError(/permission/i.test(msg) ? "addIng.cameraDenied" : "addIng.cameraFailed");
      });

    return () => {
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        s.stop().then(() => s.clear()).catch(() => { /* scanner was never started */ });
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domId]);

  return (
    <div className="space-y-3">
      <div id={domId} className="overflow-hidden rounded-md border border-border bg-black min-h-[200px]" />
      {starting && !error && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("addIng.startingCamera")}
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {t(error)}
        </div>
      )}
      {!error && <p className="text-center text-xs text-muted-foreground">{t("addIng.pointCamera")}</p>}
    </div>
  );
}

function CreateFoodStep({
  newFood,
  setNewFood,
  barcode,
}: {
  newFood: NewFoodForm;
  setNewFood: React.Dispatch<React.SetStateAction<NewFoodForm>>;
  barcode: string;
}) {
  const { t } = useI18n();
  const update = (k: keyof NewFoodForm, v: string) => setNewFood((f) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {barcode ? t("addIng.barcodeNotFound", { code: barcode }) : t("addIng.notInDb")} {t("addIng.addOnce")}
      </p>
      <div>
        <Label>{t("addIng.name")}</Label>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <Input className="mt-1.5" value={newFood.name} onChange={(e) => update("name", e.target.value)} autoFocus />
      </div>
      <div>
        <Label>{t("addIng.category")}</Label>
        <Input className="mt-1.5" placeholder={t("addIng.categoryPlaceholder")} value={newFood.category} onChange={(e) => update("category", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t("addIng.calories")}</Label>
          <Input className="mt-1.5" type="number" value={newFood.calories} onChange={(e) => update("calories", e.target.value)} />
        </div>
        <div>
          <Label>{t("addIng.protein")}</Label>
          <Input className="mt-1.5" type="number" value={newFood.protein_g} onChange={(e) => update("protein_g", e.target.value)} />
        </div>
        <div>
          <Label>{t("addIng.carbs")}</Label>
          <Input className="mt-1.5" type="number" value={newFood.carbs_g} onChange={(e) => update("carbs_g", e.target.value)} />
        </div>
        <div>
          <Label>{t("addIng.fat")}</Label>
          <Input className="mt-1.5" type="number" value={newFood.fat_g} onChange={(e) => update("fat_g", e.target.value)} />
        </div>
      </div>
    </div>
  );
}

function DetailsStep({
  food,
  quantity,
  setQuantity,
  unit,
  setUnit,
  expiryDate,
  setExpiryDate,
  onBack,
}: {
  food: Food;
  quantity: string;
  setQuantity: (v: string) => void;
  unit: UnitType;
  setUnit: (v: UnitType) => void;
  expiryDate: string;
  setExpiryDate: (v: string) => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
        <div>
          <div className="text-sm font-medium">{food.name}</div>
          {food.brand && <div className="text-xs text-muted-foreground">{food.brand}</div>}
        </div>
        <button type="button" onClick={onBack} className="text-xs text-primary hover:underline">{t("addIng.change")}</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t("addIng.quantity")}</Label>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <Input className="mt-1.5" type="number" placeholder={t("addIng.quantityPlaceholder")} value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus />
        </div>
        <div>
          <Label>{t("addIng.unit")}</Label>
          <Select value={unit} onValueChange={(v) => setUnit(v as UnitType)}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {UNIT_OPTIONS.map((u) => <SelectItem key={u} value={u}>{t(`unit.${u}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>{t("addIng.expiry")}</Label>
        <Input className="mt-1.5" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
      </div>
    </div>
  );
}
