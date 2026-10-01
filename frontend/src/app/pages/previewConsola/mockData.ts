/**
 * Datos de prueba para las vistas previas de la Consola Operativa del rematador
 * (`/preview-consola-a`, `/preview-consola-b`). Los títulos, descripciones y fotos de los lotes
 * salen de lotes reales de la base local (las fotos las sirve el backend en `localhost:8000`);
 * los precios finales de lo vendido, la ficha técnica y algunos precios base son de ejemplo.
 */

export interface MockLote {
  id: string;
  number: number;
  title: string;
  category: string;
  status: 'pending' | 'open' | 'closed_sold' | 'closed_unsold';
  basePrice: number;
  minIncrement: number;
  description: string;
  images: string[];
  attributes: Record<string, string>;
  quantity?: string;
  /** Solo desiertos: precio sugerido por la empresa para volver a rematarlo (`null` = sin precio). */
  requeuePreset?: number | null;
}

export interface MockSold {
  number: number;
  title: string;
  finalPrice: number;
}

export const MOCK_REMATE = {
  title: 'Liquidador Tecnológico: Renovación Masiva de Equipamiento IT',
  startsAt: '6 sep 2026, 14:52',
  currency: 'ARS',
  operatorId: 'A3K7P2QX',
  remateId: 'd4bca7d7-51e2-4e07-9445-38014e6eb60b',
};

export const ACTIVE_LOTE: MockLote = {
  "id": "l6",
  "number": 6,
  "title": "Palet de 10 Laptops Lenovo ThinkPad T14",
  "category": "Tecnología y hogar",
  "status": "open",
  "basePrice": 3500000,
  "minIncrement": 100000,
  "description": "Equipos portátiles con procesadores Intel Core i7 10ma Gen, 16 GB de RAM y SSD de 512 GB. Incluyen cargadores originales USB-C. Formateados con BIOS liberada y prueba de diagnóstico aprobada.",
  "images": [
    "http://localhost:8000/static/lotes/ca20e3c9-599b-4a3f-ab1d-4ff6e15c35e4/f3a5c11c-9aa8-4cf4-846f-5c14d5ea057d.jpg",
    "http://localhost:8000/static/lotes/ca20e3c9-599b-4a3f-ab1d-4ff6e15c35e4/d27e1bda-b992-49b2-b4d2-1675ba3479ff.jpg",
    "http://localhost:8000/static/lotes/ca20e3c9-599b-4a3f-ab1d-4ff6e15c35e4/a74a46a0-68f8-4f97-83ad-f96aaac6b352.jpg"
  ],
  "attributes": {
    "Marca": "Lenovo",
    "Modelo": "ThinkPad T14",
    "Procesador": "Intel Core i7 10ma Gen",
    "Memoria": "16 GB RAM",
    "Almacenamiento": "SSD 512 GB",
    "Estado": "Reacondicionado"
  },
  "quantity": "10 unidades"
};

export const UPCOMING_LOTES: MockLote[] = [
  {
    "id": "l7",
    "number": 7,
    "title": "Palet de Telefonía e Infraestructura VoIP (20 Equipos)",
    "category": "Tecnología y hogar",
    "status": "pending",
    "basePrice": 90000,
    "minIncrement": 30000,
    "description": "Lote compuesto por 20 teléfonos IP de escritorio marca Yealink T46S con pantallas a color y 1 centralita VoIP Grandstream operacional.",
    "images": [
      "http://localhost:8000/static/lotes/7eb9a46a-ae70-4c59-ab26-f576e7c44733/ef85d7b2-9788-418c-9356-c9d79bb7adc3.jpg"
    ],
    "attributes": {
      "Marca": "Yealink / Grandstream",
      "Equipos": "20 teléfonos IP + 1 centralita"
    }
  },
  {
    "id": "l8",
    "number": 8,
    "title": "Estación de Trabajo Apple MacBook Pro 16\" M2 Max",
    "category": "Tecnología y hogar",
    "status": "pending",
    "basePrice": 4200000,
    "minIncrement": 100000,
    "description": "Laptop Apple MacBook Pro de 16 pulgadas (Modelo 2023). Configuración de alto rendimiento: Chip Apple M2 Max (CPU de 12 núcleos, GPU de 38 núcleos), 64 GB de mem",
    "images": [
      "http://localhost:8000/static/lotes/226835a6-326b-4eb5-b8b3-9826c4e83d35/06f7ba75-9b2d-4f13-b949-f825ea280ace.jpg",
      "http://localhost:8000/static/lotes/226835a6-326b-4eb5-b8b3-9826c4e83d35/9a82410d-db52-413e-a111-3849fd3053c5.jpg",
      "http://localhost:8000/static/lotes/226835a6-326b-4eb5-b8b3-9826c4e83d35/5a52c4b7-5c4e-4168-840a-721b9062f583.jpg",
      "http://localhost:8000/static/lotes/226835a6-326b-4eb5-b8b3-9826c4e83d35/1533b4a0-0474-4364-8245-15f91210cacf.jpg"
    ],
    "attributes": {
      "Marca": "Apple",
      "Pantalla": "16 pulgadas"
    },
    "quantity": "1 unidad"
  },
  {
    "id": "l9",
    "number": 9,
    "title": "Servidores de rack Dell PowerEdge R740 (x2)",
    "category": "Tecnología y hogar",
    "status": "pending",
    "basePrice": 5600000,
    "minIncrement": 150000,
    "description": "Lote compuesto por 2 servidores Dell PowerEdge R740 de 2U. Cada unidad cuenta con procesador dual Intel Xeon Scalable, 128 GB RAM DDR4 ECC y 4 discos SSD SAS de",
    "images": [
      "http://localhost:8000/static/lotes/0dfb7353-19a0-4c57-b642-be4e794986a3/441baa1a-f3bc-4cc2-94ce-331448f20ca2.jpg",
      "http://localhost:8000/static/lotes/0dfb7353-19a0-4c57-b642-be4e794986a3/a5150d32-4f81-449b-909d-08143495552a.webp",
      "http://localhost:8000/static/lotes/0dfb7353-19a0-4c57-b642-be4e794986a3/d43c1659-3ea2-4f4d-ae13-bb5782fe3665.jpg"
    ],
    "attributes": {
      "Marca": "Dell",
      "Modelo": "PowerEdge R740"
    },
    "quantity": "2 unidades"
  },
  {
    "id": "l10",
    "number": 10,
    "title": "Set de Monitores Profesionales Dell UltraSharp 27\" 4K (x4)",
    "category": "Tecnología y hogar",
    "status": "pending",
    "basePrice": 1900000,
    "minIncrement": 50000,
    "description": "Conjunto de 4 monitores profesionales Dell UltraSharp U2720Q de 27 pulgadas. Resolución 4K UHD (3840 x 2160), panel IPS con 99% sRGB y soporte para HDR400. Puer",
    "images": [
      "http://localhost:8000/static/lotes/c55363a4-3bb1-4e3c-af5d-82494f49615c/f62bfd30-4244-47fb-9980-89f913a18a28.jpg",
      "http://localhost:8000/static/lotes/c55363a4-3bb1-4e3c-af5d-82494f49615c/88eaac4b-52e4-4c36-9549-84b47bf6671d.jpg"
    ],
    "attributes": {
      "Marca": "Dell",
      "Resolución": "4K"
    },
    "quantity": "4 unidades"
  },
  {
    "id": "l11",
    "number": 11,
    "title": "Palet de equipamiento Audiovisual para salas de reunión",
    "category": "Tecnología y hogar",
    "status": "pending",
    "basePrice": 2400000,
    "minIncrement": 100000,
    "description": "Kit corporativo para conferencias que comprende: 2 barras de video Logitech Rally Bar (4K, matriz de micrófonos e inteligencia artificial), 1 pantalla táctil de",
    "images": [
      "http://localhost:8000/static/lotes/38018a17-1dcf-45ff-aaa0-0bbd4679da54/fcffb59d-ed3c-4395-8a71-1c8804fe484a.jpg",
      "http://localhost:8000/static/lotes/38018a17-1dcf-45ff-aaa0-0bbd4679da54/b8c5692c-5570-42c8-96d0-1c5e0151c489.jpg"
    ],
    "attributes": {}
  }
];

export const DESIERTO_LOTES: MockLote[] = [
  {
    "id": "l3",
    "number": 3,
    "title": "Cuatriciclo espectacular militar solo tiene 8000 km",
    "category": "Vehículos",
    "status": "closed_unsold",
    "basePrice": 4500000,
    "minIncrement": 35000,
    "description": "Increible cuatriciclo militar, como nuevo, muy poco uso, solo 8000 kilometros. Llevatelo para los medanos de pinamar toda la gente va a envidiarte quedas como un copado mal re zarpado llevatelo",
    "images": [
      "http://localhost:8000/static/lotes/2e685654-02ca-4b75-b444-ddf7e2d9fedc/2b3eb6aa-7170-4c70-8527-0bfd221f2765.jpg",
      "http://localhost:8000/static/lotes/2e685654-02ca-4b75-b444-ddf7e2d9fedc/a58d8cad-aedb-45bb-81d4-bc441834336e.jpg",
      "http://localhost:8000/static/lotes/2e685654-02ca-4b75-b444-ddf7e2d9fedc/fe5d335a-4779-49ea-82a7-1fed2374e9bd.jpg",
      "http://localhost:8000/static/lotes/2e685654-02ca-4b75-b444-ddf7e2d9fedc/526fbb28-f28e-4f79-8ec6-0e613cd69893.jpg"
    ],
    "attributes": {},
    "requeuePreset": 3600000
  },
  {
    "id": "l5",
    "number": 5,
    "title": "Dos autos policiales negros Focus 2021 como nuevo - motor 1.8 turbo diesel",
    "category": "Vehículos",
    "status": "closed_unsold",
    "basePrice": 26000000,
    "minIncrement": 300000,
    "description": "Lote de dos Ford Focus hermosos intactos. Caja manual y motor 1.8. No tienen ningun tipo de detalle, todos los palpeles al dis, te lo llevas andando sin ningun problema. El lote es por los dos autos no por solo uno",
    "images": [
      "http://localhost:8000/static/lotes/523ca8e5-3bac-4c7e-853e-0456b4efcbe9/fa16f650-0450-41e7-8cd5-ec4ebbcc6a95.png",
      "http://localhost:8000/static/lotes/523ca8e5-3bac-4c7e-853e-0456b4efcbe9/942f04fe-3400-4fd7-b11a-35b44c04d315.png",
      "http://localhost:8000/static/lotes/523ca8e5-3bac-4c7e-853e-0456b4efcbe9/bd1c0bc1-fd29-4ffb-b7d7-31f90b4920e3.png",
      "http://localhost:8000/static/lotes/523ca8e5-3bac-4c7e-853e-0456b4efcbe9/253d696d-0c4b-4bb1-8a8a-97492c818f2b.png"
    ],
    "attributes": {},
    "requeuePreset": null
  }
];

export const SOLD_LOTES: MockSold[] = [
  {
    "number": 1,
    "title": "Lote de 15 Monitores Dell Professional de 24\" FHD",
    "finalPrice": 1350000
  },
  {
    "number": 2,
    "title": "Servidor de Rack HP ProLiant DL380 Gen10",
    "finalPrice": 3100000
  },
  {
    "number": 4,
    "title": "Combo de Conectividad: 4 Switches Cisco Catalyst 3850 + Access Points",
    "finalPrice": 1950000
  }
];
