import * as React from "react";
import { Calendar as CalendarIcon, CalendarRange, Clock, Sparkles, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

type Preset = "quincenal" | "mensual" | "trimestre" | "cuatrimestre" | "semestral" | "anual";

export type TiersFilterSelection =
  | { mode: "month"; month: number; year: number }
  | { mode: "preset"; preset: Preset }
  | { mode: "manual"; from: Date | null; to: Date | null };

export function monthLabel(m: number) {
  const names = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  return names[(m - 1 + 12) % 12] || String(m);
}

export interface TiersFiltersProps {
  defaultMode?: TiersFilterSelection["mode"];
  defaultMonth?: number; // 1..12
  defaultYear?: number; // YYYY
  defaultPreset?: Preset;
  defaultFrom?: Date | null;
  defaultTo?: Date | null;
  onApply?: (sel: TiersFilterSelection) => void;
  className?: string;
}

export default function TiersFilters(props: TiersFiltersProps) {
  const now = React.useMemo(() => new Date(), []);
  const curYear = React.useMemo(() => now.getFullYear(), [now]);
  const [tab, setTab] = React.useState<TiersFilterSelection["mode"]>(props.defaultMode || "month");
  const [month, setMonth] = React.useState<number>(props.defaultMonth || (now.getMonth() + 1));
  const [year, setYear] = React.useState<number>(props.defaultYear || curYear);
  const [preset, setPreset] = React.useState<Preset>(props.defaultPreset || "mensual");
  const [range, setRange] = React.useState<{ from: Date | undefined; to?: Date | undefined }>({ from: props.defaultFrom || undefined, to: props.defaultTo || undefined });

  const years = React.useMemo(() => {
    const y0 = curYear + 1;
    return Array.from({ length: 6 }, (_, i) => y0 - i);
  }, [curYear]);

  const apply = React.useCallback(() => {
    if (tab === "month") props.onApply?.({ mode: "month", month, year });
    else if (tab === "preset") props.onApply?.({ mode: "preset", preset });
    else props.onApply?.({ mode: "manual", from: range.from || null, to: range.to || null });
  }, [tab, month, year, preset, range, props]);

  const PresetBadge = React.useMemo(() => {
    const label: Record<Preset, string> = { quincenal: "Quincenal", mensual: "Mensual", trimestre: "Trimestre", cuatrimestre: "Cuatrimestre", semestral: "Semestral", anual: "Anual" };
    return label[preset];
  }, [preset]);

  return (
    <Card className={cn("border bg-white shadow-sm", props.className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-4 w-4 text-blue-600" />
          Filtros de Ventana y Comparativa
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs value={tab} onValueChange={(v)=> setTab(v as any)}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="month">Mes</TabsTrigger>
            <TabsTrigger value="preset">Temporalidad</TabsTrigger>
            <TabsTrigger value="manual">Manual</TabsTrigger>
          </TabsList>
          <TabsContent value="month" className="mt-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Mes</label>
                <Select value={String(month)} onValueChange={(v: string) => setMonth(Number(v))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona mes" /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <SelectItem key={m} value={String(m)}>{monthLabel(m)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Año</label>
                <Select value={String(year)} onValueChange={(v: string) => setYear(Number(v))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona año" /></SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="preset" className="mt-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Temporalidad</label>
                <Select value={preset} onValueChange={(v: string) => setPreset(v as Preset)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona temporalidad" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quincenal">Quincenal</SelectItem>
                    <SelectItem value="mensual">Mensual</SelectItem>
                    <SelectItem value="trimestre">Trimestre</SelectItem>
                    <SelectItem value="cuatrimestre">Cuatrimestre</SelectItem>
                    <SelectItem value="semestral">Semestral</SelectItem>
                    <SelectItem value="anual">Anual</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-2 flex items-center gap-1"><Clock className="h-3 w-3" /> Se compara con la ventana anterior inmediata de misma duración.</p>
              </div>
              <div className="rounded-md border bg-white p-3 text-sm">Selección: <span className="font-medium">{PresetBadge}</span></div>
            </div>
          </TabsContent>
          <TabsContent value="manual" className="mt-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Rango de fechas</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button className="mt-1 w-full justify-start text-left font-normal">
                      <CalendarRange className="mr-2 h-4 w-4" />
                      {range.from ? (range.to ? (<span>{range.from.toLocaleDateString()} – {range.to.toLocaleDateString()}</span>) : range.from.toLocaleDateString()) : (<span>Selecciona rango</span>)}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="range" selected={range} onSelect={(r:any) => setRange({ from: r?.from, to: r?.to })} numberOfMonths={2} />
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-gray-500 mt-2 flex items-center gap-1"><CalendarIcon className="h-3 w-3" /> Se compara con la ventana anterior inmediata (misma duración).</p>
              </div>
              <div className="rounded-md border bg-white p-3 text-sm">
                Selección: {range.from ? range.from.toLocaleDateString() : "—"} {range.to ? (<><ChevronRight className="inline mx-1 h-3 w-3" /> {range.to.toLocaleDateString()}</>) : null}
              </div>
            </div>
          </TabsContent>
        </Tabs>
        <div className="mt-4 flex justify-end">
          <Button onClick={apply} className="gap-2">Aplicar</Button>
        </div>
      </CardContent>
    </Card>
  );
}

