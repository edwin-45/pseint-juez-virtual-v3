# PSeInt Judge — Fundamentos de Programación

Plataforma 100% frontend para practicar PSeInt mediante ejercicios con juez virtual.

## Acceso y roles

### Administrador

La cuenta administrativa está reservada para:

- Código: `04370`
- Nombre: `EDWIN TORRADO`

Esta es la única cuenta que puede ver y utilizar:

- **Exportar JSON**
- **Importar JSON**

El código `04370` está reservado. Si se intenta iniciar sesión con ese código y un nombre diferente, el acceso se rechaza.

### Estudiantes

Cualquier otro código y nombre se registra como estudiante.

Los estudiantes pueden:

- Resolver ejercicios.
- Probar ejemplos.
- Enviar código al juez.
- Ver su progreso.
- Conservar borradores en el navegador.

No pueden importar ni exportar la información general.

## Banco de ejercicios

La versión actual contiene **60 ejercicios**.

### Si / Entonces

- 10 básicos.
- 10 intermedios.
- 10 avanzados.

Total: **30 ejercicios**.

### Segun

- 10 básicos.
- 10 intermedios.
- 10 avanzados.

Total: **30 ejercicios**.

La interfaz permite filtrar por tema y dificultad.

## Validación

El juez realiza dos niveles de validación:

1. **Validación estructural**
   - Los ejercicios de Si / Entonces exigen `Si ... Entonces` y `FinSi`.
   - Los ejercicios de Segun exigen `Segun ... Hacer` y `FinSegun`.
   - Algunos ejercicios avanzados exigen combinar ambas estructuras.

2. **Validación funcional**
   - El pseudocódigo se ejecuta con un mini-intérprete escrito en JavaScript.
   - Se utilizan varios casos de prueba.
   - La salida obtenida se compara con la salida esperada.

## Almacenamiento

GitHub Pages no puede modificar archivos del repositorio desde JavaScript.

Por ello, esta edición guarda los usuarios, intentos y progreso en `localStorage`.

El administrador puede exportar el estado completo a un archivo JSON e importarlo posteriormente.

### Limitación

Los datos almacenados en `localStorage` pertenecen al navegador y dispositivo donde se ejecuta la plataforma. No se sincronizan automáticamente entre los computadores de los estudiantes.

Para sincronización centralizada se requeriría un servicio externo como Firebase, Supabase, Google Apps Script o un backend propio.

## Archivos principales

- `index.html`: interfaz.
- `styles.css`: estilos.
- `app.js`: aplicación, roles, juez e intérprete.
- `data/exercises.json`: 60 ejercicios y casos de prueba.
- `data/state.example.json`: ejemplo de estructura del estado.

## Ejecutar en local

Desde la carpeta del proyecto puedes usar:

```bash
python -m http.server 8000
```

y abrir:

```text
http://localhost:8000
```

También puedes usar VS Code con Live Server.

## Publicar en GitHub Pages

1. Sube el contenido de esta carpeta a un repositorio.
2. Entra en `Settings > Pages`.
3. Selecciona `Deploy from a branch`.
4. Selecciona `main`.
5. Selecciona `/ (root)`.
6. Guarda.

## Sintaxis principal usada en esta plataforma

Las plantillas utilizan `Algoritmo / FinAlgoritmo`.

El juez también acepta `Proceso / FinProceso` porque PSeInt admite ambas formas.
- `Definir`
- `Leer`
- `Escribir`
- `<-`
- `Si / SiNo / FinSi`
- `Segun / De Otro Modo / FinSegun`
- `Mientras / FinMientras`
- `Para / FinPara`
- `Repetir / Hasta Que`
- `+ - * / ^ MOD`
- `= <> < > <= >=`
- `Y O NO`
