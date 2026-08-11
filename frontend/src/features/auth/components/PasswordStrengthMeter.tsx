interface StrengthResult {
  score: number;
  label: string;
  barClassName: string;
  textClassName: string;
}

/**
 * Puramente informativo: no bloquea el submit ni reemplaza la validación real
 * (`minLength={8}` en `RegisterPage`, más lo que valide el backend). Sólo le da al
 * usuario una idea de qué tan robusta es la contraseña que está eligiendo.
 */
function getStrength(password: string): StrengthResult {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: 'Débil', barClassName: 'bg-danger-500', textClassName: 'text-danger-600' };
  if (score <= 2) return { score, label: 'Media', barClassName: 'bg-warning-500', textClassName: 'text-warning-600' };
  if (score === 3) return { score, label: 'Buena', barClassName: 'bg-brand-500', textClassName: 'text-brand-600' };
  return { score, label: 'Fuerte', barClassName: 'bg-success-500', textClassName: 'text-success-600' };
}

export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;

  const { score, label, barClassName, textClassName } = getStrength(password);

  return (
    <div className="mt-2">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((segment) => (
          <span
            key={segment}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              segment < score ? barClassName : 'bg-slate-200'
            }`}
          />
        ))}
      </div>
      <p className={`mt-1.5 text-xs font-medium ${textClassName}`}>Seguridad: {label}</p>
    </div>
  );
}
