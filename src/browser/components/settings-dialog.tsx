import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import {
  useSettings,
  UI_SCALE_STEPS,
  scaleToFontSizePercent,
} from "../contexts/settings";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { uiScale, setUiScale } = useSettings();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>
          Customize how Pulldash looks and feels.
        </DialogDescription>

        <div>
          <h3 className="text-sm font-medium text-foreground">UI Scale</h3>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">
            Scale the entire interface — fonts, spacing, and controls.
          </p>
          <RadioGroup
            value={String(uiScale)}
            onValueChange={(value) => setUiScale(Number(value))}
          >
            {UI_SCALE_STEPS.map((step) => (
              <label
                key={step}
                className="flex items-center gap-2 cursor-pointer text-sm text-foreground"
              >
                <RadioGroupItem value={String(step)} />
                <span>
                  {scaleToFontSizePercent(step)}
                  {step === 1 && (
                    <span className="text-muted-foreground"> (default)</span>
                  )}
                </span>
              </label>
            ))}
          </RadioGroup>
        </div>
      </DialogContent>
    </Dialog>
  );
}
