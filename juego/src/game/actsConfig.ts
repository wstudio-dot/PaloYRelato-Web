import type { ActDefinition } from './types';

export const ACTS: ActDefinition[] = [
  {
    id: 'ALGORITHM',
    index: 0,
    character: 'coffee',
    videoTitle: 'El algoritmo secreto que sabe qué vas a comprar antes que tú',
    shortTitle: 'Acto 1 · El Algoritmo',
    instruction: 'Esquiva compras impulsivas y atrapa tazas de café',
    controlHint: 'A / D o Flechas (o mueve el ratón) para esquivar',
    accentColor: '#5F6E3E',
    paperTint: '#FAF9F6',
    duration: 15,
  },
  {
    id: 'EXAM',
    index: 1,
    character: 'student',
    videoTitle: '¿Qué pasa en tu cabeza cuando te quedas en blanco en un examen?',
    shortTitle: 'Acto 2 · Mente en Blanco',
    instruction: 'Destruye pensamientos intrusivos y recoge respuestas clave',
    controlHint: 'A / D para moverte · Espacio o Clic sobre ideas intrusivas',
    accentColor: '#3B82F6',
    paperTint: '#F5F8FC',
    duration: 15,
  },
  {
    id: 'SINGER',
    index: 2,
    character: 'singer',
    videoTitle: 'Famoso de un día para otro sin saber leer una partitura',
    shortTitle: 'Acto 3 · Famoso Sin Partitura',
    instruction: 'Toca las 3 cuerdas cuando las notas lleguen al círculo',
    controlHint: 'Teclas 1 · 2 · 3 (o A · S · D) o haz clic en las 3 cuerdas',
    accentColor: '#DF2C2C',
    paperTint: '#FDF8F7',
    duration: 15,
  },
  {
    id: 'CANCELLED',
    index: 3,
    character: 'gamer',
    videoTitle: 'El juego más esperado del año cancelado 24 horas antes',
    shortTitle: 'Acto 4 · Cancelado 24h Antes',
    instruction: 'Bloquea spoilers y mensajes tóxicos con tu mando; deja pasar snacks',
    controlHint: 'W / S o Flechas (o ratón arriba/abajo) para mover el escudo',
    accentColor: '#6C1D2E',
    paperTint: '#FBF7F8',
    duration: 15,
  },
];

export const IMPULSE_ADS = [
  'Tostadora Smart',
  'Calcetines GPS',
  'Curso de Silbido',
  'Lámpara de Sal',
  'Taza Autolavable',
  'Almohada Ergonómica',
  'Imán Anti-Lunes',
  'Maceta Musical',
];

export const INTRUSIVE_THOUGHTS = [
  '¿Apagué el gas?',
  'Canción del súper',
  '¿Y si soy un NPC?',
  'Pingüinos tienen rodillas',
  'Aquel fallo de 2018',
  '¿Qué ceno hoy?',
  'La red va lenta',
];

export const EXAM_ANSWERS = ['x = 42', 'Mitocondria', '1492', 'H₂O', 'E = mc²'];

export const RAGE_TWEETS = [
  '¡CANCELADO!',
  'SPOILER FINAL',
  'SERVIDOR CAÍDO',
  'SIN REEMBOLSO',
  'RETRASO 2029',
  'FALSAS PROMESAS',
];
