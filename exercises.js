'use strict';
/*
  Definición de los ejercicios.

  Cada registro guarda el número de versión de la plantilla con la que se creó (campo `v`).
  Para AÑADIR o CAMBIAR apartados en el futuro: copia la versión actual como una nueva
  (p. ej. TEMPLATES[2]), haz los cambios ahí y sube CURRENT_VERSION. Los días antiguos
  se seguirán mostrando y exportando con su versión original.

  Tipos de apartado (kind):
    - fixed  : número fijo de elementos (count)
    - repeat : elementos que se pueden añadir (min = cuántos aparecen al empezar)
    - single : un único bloque de campos
  Tipos de campo (type): text, textarea, time, scale (0-10), chips (selección múltiple)
*/

const SCALE_ANTES = { id: 'int_antes', type: 'scale', label: 'Intensidad de la emoción · antes', short: 'Intensidad antes' };
const SCALE_DESPUES = { id: 'int_despues', type: 'scale', label: 'Intensidad de la emoción · después', short: 'después' };
const HORA = { id: 'hora', type: 'time', label: 'Hora' };

const TEMPLATES = {
  1: {
    blocks: [
      {
        id: 'manana', title: 'Mañana', icon: '☀️',
        sections: ['suf_manana'],
      },
      {
        id: 'dia', title: 'Durante el día', icon: '🕐',
        note: 'Rumiación y añoranza pueden aparecer varias veces: con registrar una al día es suficiente.',
        sections: ['satisfaccion', 'rumiacion', 'anoranza'],
      },
      {
        id: 'noche', title: 'Noche', icon: '🌙',
        note: 'Dedica unos 10–15 minutos. No hace falta escribir mucho: lo importante es hacerlo.',
        sections: ['suf_noche', 'pens_neg', 'reflexiones'],
      },
    ],

    sections: {
      suf_manana: {
        title: 'Suficiencia · mañana',
        subtitle: 'Afirmación positiva y creíble',
        kind: 'fixed', count: 3, itemLabel: 'Afirmación {n}',
        guide: [
          '3 frases o conceptos sobre ti que puedas <b>defender con hechos</b>.',
          '<b>Creíble antes que positiva</b>: si no te la crees, ajústala hasta que sí.',
          'Apunta el hecho que la respalda.',
          'Prueba: ¿se lo dirías así a un buen amigo?',
        ],
        example: [
          'Soy capaz de aprender cosas nuevas → este año he sacado adelante un curso exigente.',
          'Sé afrontar imprevistos → cuando algo se tuerce, busco soluciones en lugar de bloquearme.',
          'No necesito hacerlo todo perfecto desde el principio para avanzar hacia mis objetivos.',
        ],
        fields: [
          { id: 'afirmacion', type: 'textarea', label: 'Afirmación', placeholder: 'Soy una persona que…' },
          { id: 'hecho', type: 'textarea', label: 'Hecho que lo demuestra', placeholder: 'Lo demuestra que…' },
        ],
      },

      satisfaccion: {
        title: 'Satisfacción autónoma',
        subtitle: 'Después de una actividad que valoro',
        kind: 'repeat', min: 1, itemLabel: 'Actividad {n}', addLabel: 'Añadir otra actividad',
        guide: [
          'Justo después de la actividad, dedica unos minutos a las tres preguntas.',
          'Mínimo <b>una al día</b>; añade más si ha habido otras que te parezcan relevantes.',
          'Valen también <b>cosas pequeñas</b>: una comida que te salió bien, un paseo, una conversación.',
          'La clave es la tercera: el valor no depende de que alguien lo vea.',
        ],
        example: [
          'Actividad: salir a correr',
          '¿Qué he disfrutado? El aire fresco y desconectar un rato.',
          '¿Qué capacidad he puesto en práctica? Constancia: he mantenido el ritmo aunque me costaba.',
          '¿Qué valor tiene? Cuidarme y demostrarme que cumplo lo que me propongo.',
        ],
        fields: [
          { id: 'actividad', type: 'text', label: 'Actividad', placeholder: 'Deporte, paseo, cocinar, trabajo…' },
          { id: 'disfrute', type: 'textarea', label: '¿Qué he disfrutado haciendo?' },
          { id: 'capacidad', type: 'textarea', label: '¿Qué capacidad personal he puesto en práctica?' },
          { id: 'valor', type: 'textarea', label: '¿Qué valor tiene esta experiencia para mí, aunque nadie la haya visto?' },
        ],
      },

      rumiacion: {
        title: 'Rumiación',
        subtitle: 'Detectar · etiquetar · permitir · volver al presente',
        kind: 'repeat', min: 1, itemLabel: 'Momento {n}', addLabel: 'Registrar otro momento',
        guide: [
          '<b>1. Detectar</b>: escríbelo como «Estoy teniendo el pensamiento de que…». Así lo miras desde fuera.',
          '<b>2. Etiqueta neutral</b>: di qué tipo de pensamiento es, sin juzgarlo.',
          '<b>3. Permitir</b>: deja que esté sin resolverlo. No intentes convencerte de nada; solo reconoce la emoción.',
          '<b>4. Volver al presente</b>: elige una acción concreta de ahora y pon ahí la atención. Estás entrenando a elegir dónde enfocarte.',
          'Marca la intensidad antes y después: con las semanas verás si te funciona.',
        ],
        example: [
          '1. Estoy teniendo el pensamiento de que la conversación de esta mañana salió mal.',
          '2. Esto es un pensamiento sobre algo que ya pasó (recuerdo, juicio).',
          '3. No intento decidir si fue bien o mal; solo reconozco la incomodidad.',
          '4. Vuelvo a lo que estoy haciendo: preparar la cena, atento a lo que hago.',
        ],
        fields: [
          HORA,
          { id: 'situacion', type: 'textarea', label: 'Situación', placeholder: 'Dónde estaba, qué estaba haciendo…' },
          SCALE_ANTES,
          { id: 'pensamiento', type: 'textarea', label: '1. Pensamiento detectado', placeholder: 'Estoy teniendo el pensamiento de que…' },
          { id: 'etiqueta', type: 'chips', label: '2. Etiqueta neutral', options: ['Deseo', 'Recuerdo', 'Predicción', 'Juicio', 'Comparación', 'Preocupación'] },
          { id: 'etiqueta_texto', type: 'text', label: 'En mis palabras', placeholder: 'Esto es un pensamiento sobre…' },
          { id: 'permitir', type: 'textarea', label: '3. Permitir que exista sin resolverlo', placeholder: 'Qué emoción reconozco, sin intentar resolverla' },
          { id: 'accion', type: 'textarea', label: '4. Acción del presente', placeholder: 'Dónde he puesto mi atención' },
          SCALE_DESPUES,
        ],
      },

      anoranza: {
        title: 'Gestión de la añoranza',
        subtitle: 'Separar lo que siento, lo que sé y lo que predigo',
        kind: 'repeat', min: 1, itemLabel: 'Momento {n}', addLabel: 'Registrar otro momento',
        guide: [
          'Objetivo: que la tristeza no desencadene una cadena de conclusiones negativas sobre el futuro.',
          '<b>Lo que siento</b>: nombra las emociones.',
          '<b>Valídalo</b>: la emoción no está equivocada. «Es comprensible que eche esto de menos, porque me importa».',
          '<b>Lo que sé</b>: solo hechos objetivos de ahora mismo.',
          '<b>Lo que predigo</b>: reconócelo como una predicción, no como un hecho. La que se equivoca es la predicción, no la emoción.',
          '<b>¿Qué hago ahora?</b>: una acción concreta a partir de lo que sé.',
          'No uses «lo que sé» para discutirle a la emoción.',
        ],
        example: [
          'Situación: echo de menos la etapa en la que tenía a mis amigos cerca → ¿y si nunca vuelvo a tener algo así?',
          'Lo que siento: tristeza, añoranza, soledad.',
          'Lo valido: es comprensible echarlo de menos, porque me importa.',
          'Lo que sé: ahora vivo en otra ciudad y estoy empezando a conocer gente.',
          'Lo que predigo: quizá nunca vuelva a tener un grupo así.',
          '¿Qué hago ahora? Escribir a un amigo y mirar alguna actividad para este fin de semana.',
        ],
        fields: [
          HORA,
          { id: 'situacion', type: 'textarea', label: 'Situación', placeholder: 'Echo de menos… → ¿Y si…?' },
          SCALE_ANTES,
          { id: 'emociones', type: 'chips', label: 'Lo que siento', options: ['Tristeza', 'Añoranza', 'Deseo de cariño', 'Soledad', 'Miedo', 'Ansiedad', 'Frustración'] },
          { id: 'siento', type: 'textarea', label: 'Lo que siento, en mis palabras' },
          { id: 'validacion', type: 'textarea', label: 'Lo valido', placeholder: 'Es comprensible que sienta esto porque…' },
          { id: 'se', type: 'textarea', label: 'Lo que sé', placeholder: 'Solo hechos de ahora mismo' },
          { id: 'predigo', type: 'textarea', label: 'Lo que estoy prediciendo', placeholder: 'Quizá…' },
          { id: 'ahora', type: 'textarea', label: '¿Qué hago ahora?', placeholder: 'Una acción concreta a partir de lo que sé' },
          SCALE_DESPUES,
        ],
      },

      suf_noche: {
        title: 'Suficiencia · noche',
        subtitle: 'Reconocer sin minimizar',
        kind: 'fixed', count: 3, itemLabel: 'Cosa {n}',
        guide: [
          '3 cosas que hayas hecho bien hoy, aunque parezcan pequeñas.',
          'Para cada una, identifica <b>qué capacidad refleja</b>.',
          'Sin «pero», sin «solo», sin «no era para tanto»: no le restes valor.',
        ],
        example: [
          'He terminado una tarea que llevaba días posponiendo.',
          '→ Tengo constancia y soy capaz de cumplir lo que me propongo.',
        ],
        fields: [
          { id: 'hecho', type: 'textarea', label: 'Lo que he hecho bien' },
          { id: 'capacidad', type: 'textarea', label: 'Capacidad que refleja' },
        ],
      },

      pens_neg: {
        title: 'Pensamientos negativos',
        subtitle: 'Nombrarlos y proponer una alternativa',
        kind: 'repeat', min: 1, optional: true, itemLabel: 'Pensamiento {n}', addLabel: 'Añadir otro pensamiento',
        guide: [
          'Solo si ha aparecido alguno. Si no, déjalo en blanco.',
          'Escríbelo tal cual, empezando por «Mi mente me dice que…».',
          'Propón una alternativa <b>creíble</b>, no forzadamente positiva.',
          'Prueba: ¿se lo dirías así a un buen amigo?',
        ],
        example: [
          'Mi mente me dice que no soy suficientemente inteligente porque he hecho «esto» mal.',
          '→ Esto lo estoy aprendiendo, y equivocarme no significa que sea incapaz de hacerlo.',
        ],
        fields: [
          { id: 'pensamiento', type: 'textarea', label: 'Mi mente me dice que…' },
          { id: 'alternativa', type: 'textarea', label: 'Alternativa creíble' },
        ],
      },

      reflexiones: {
        title: 'Otras reflexiones',
        subtitle: 'Espacio libre',
        kind: 'single', optional: true,
        guide: ['Lo que quieras anotar del día: pensamientos, comentarios, cosas para hablar en sesión…'],
        fields: [
          { id: 'texto', type: 'textarea', label: 'Reflexiones', hideLabel: true, rows: 5 },
        ],
      },
    },
  },
};

const CURRENT_VERSION = 1;
