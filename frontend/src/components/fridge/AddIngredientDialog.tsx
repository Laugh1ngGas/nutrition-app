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
import { AlertTriangle, Camera, Loader2, Plus, Search } from "lucide-react";
import {
  useFoodSearch,
  getFoodByBarcode,
  createFood,
  addFridgeItem,
} from "@/integrations/api/hooks";
import type { Food, UnitType } from "@/integrations/api/types";
import { toast } from "sonner";

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
  const [mode, setMode] = useState<"search" | "scan">("search");
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
      toast.error("Name is required");
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
      toast.error("Couldn't create ingredient — please try again");
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
      toast.success(`${selectedFood.name} added to fridge`);
      onAdded();
      onOpenChange(false);
    } catch {
      toast.error("Couldn't add ingredient — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to fridge</DialogTitle>
        </DialogHeader>

        {step === "pick" && (
          <Tabs value={mode} onValueChange={(v) => setMode(v as "search" | "scan")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="search"><Search className="h-4 w-4" /> Search</TabsTrigger>
              <TabsTrigger value="scan"><Camera className="h-4 w-4" /> Scan barcode</TabsTrigger>
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
          </Tabs>
        )}

        {step === "create" && (
          <>
            <CreateFoodStep newFood={newFood} setNewFood={setNewFood} barcode={prefillBarcode} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("pick")}>Cancel</Button>
              <Button onClick={submitNewFood} disabled={creatingFood}>
                {creatingFood ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create & Continue"}
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
              <Button variant="outline" onClick={() => { setStep("pick"); setSelectedFood(null); }}>Back</Button>
              <Button onClick={submitAdd} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add to Fridge"}
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
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <Input
          className="pl-9"
          placeholder="Search ingredients..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      <div className="max-h-64 overflow-y-auto rounded-md border border-border">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Searching...
          </div>
        ) : query.trim().length < 2 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Type at least 2 characters to search.
          </div>
        ) : results.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No matches for &quot;{query}&quot;
          </div>
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
                  <span className="text-xs text-muted-foreground shrink-0">{f.calories} kcal/100g</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {query.trim().length >= 2 && (
        <Button type="button" variant="outline" className="w-full" onClick={onCreateNew}>
          <Plus className="h-4 w-4" /> Can&apos;t find it? Add &quot;{query}&quot; as new ingredient
        </Button>
      )}
    </div>
  );
}

function ScanTab({ onDetected }: { onDetected: (barcode: string) => void }) {
  const regionId = useId();
  const domId = `barcode-region-${regionId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const detectedRef = useRef(false);
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setError(
          /permission/i.test(msg)
            ? "Camera access denied. Allow camera permission and try again."
            : "Couldn't start the camera on this device."
        );
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
          <Loader2 className="h-4 w-4 animate-spin" /> Starting camera...
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}
      {!error && <p className="text-center text-xs text-muted-foreground">Point your camera at a barcode</p>}
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
  const update = (k: keyof NewFoodForm, v: string) => setNewFood((f) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {barcode ? `No product found for barcode ${barcode}.` : "Not in our database yet."} Add it once, reuse it forever.
      </p>
      <div>
        <Label>Name</Label>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <Input className="mt-1.5" value={newFood.name} onChange={(e) => update("name", e.target.value)} autoFocus />
      </div>
      <div>
        <Label>Category</Label>
        <Input className="mt-1.5" placeholder="e.g. Dairy, Produce" value={newFood.category} onChange={(e) => update("category", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Calories / 100g</Label>
          <Input className="mt-1.5" type="number" value={newFood.calories} onChange={(e) => update("calories", e.target.value)} />
        </div>
        <div>
          <Label>Protein (g)</Label>
          <Input className="mt-1.5" type="number" value={newFood.protein_g} onChange={(e) => update("protein_g", e.target.value)} />
        </div>
        <div>
          <Label>Carbs (g)</Label>
          <Input className="mt-1.5" type="number" value={newFood.carbs_g} onChange={(e) => update("carbs_g", e.target.value)} />
        </div>
        <div>
          <Label>Fat (g)</Label>
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
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
        <div>
          <div className="text-sm font-medium">{food.name}</div>
          {food.brand && <div className="text-xs text-muted-foreground">{food.brand}</div>}
        </div>
        <button type="button" onClick={onBack} className="text-xs text-primary hover:underline">Change</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Quantity</Label>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <Input className="mt-1.5" type="number" placeholder="e.g. 500" value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus />
        </div>
        <div>
          <Label>Unit</Label>
          <Select value={unit} onValueChange={(v) => setUnit(v as UnitType)}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {UNIT_OPTIONS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Expiry date (optional)</Label>
        <Input className="mt-1.5" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
      </div>
    </div>
  );
}
