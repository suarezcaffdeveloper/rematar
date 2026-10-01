/** Pasos del canje, mostrados junto al formulario -- puramente explicativos, para que
 * alguien que entra por primera vez entienda de dónde salen el ID y el código antes de
 * pedírselos. */
const CLAIM_STEPS = [
  {
    title: 'La empresa te asigna un remate',
    description: 'Y te comparte el ID del remate junto con un código de operador de un solo uso.',
  },
  {
    title: 'Ingresás los datos acá',
    description: 'Completá el ID y el código en el formulario para canjearlo.',
  },
  {
    title: 'Entrás en vivo',
    description: 'Pasás directo a la Consola Operativa para manejar el remate en tiempo real.',
  },
] as const;

/** "Cómo conseguir el acceso": los tres pasos del canje como línea de tiempo, en segundo
 * plano al costado del formulario (mismo lenguaje que `RedeemHowTo` del comprador). */
export function OperatorClaimHowTo() {
  return (
    <aside aria-labelledby="como-conseguir-acceso" className="order-2 lg:order-none lg:pt-2">
      <h2 id="como-conseguir-acceso" className="text-lg font-semibold tracking-tight">
        Cómo conseguir el acceso
      </h2>
      <ol className="mt-5 border-t border-ink pt-6">
        {CLAIM_STEPS.map((step, index) => (
          <li key={step.title} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-4">
            <div className="flex flex-col items-center">
              <span aria-hidden="true" className="mt-1.5 h-2.5 w-2.5 rounded-full bg-ink" />
              {index < CLAIM_STEPS.length - 1 && <span aria-hidden="true" className="my-1 w-px flex-1 bg-line-strong" />}
            </div>
            <div className={index < CLAIM_STEPS.length - 1 ? 'pb-6' : ''}>
              <p className="font-medium">{step.title}</p>
              <p className="mt-1 text-sm text-ink-muted">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}
