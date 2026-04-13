# Shopify Relife Plus

Tema Shopify OS 2.0 creato come base per un sito ispirato a `relifebattery.it`, ma più pulito, moderno e orientato alla conversione.

## Contenuto

- homepage landing completa
- header e footer personalizzati
- pagina contatti con form Shopify
- template pagina generica
- template privacy
- sezioni modulari modificabili dall'editor Shopify

## Cartella tema

Usa direttamente questa cartella:

`shopify-relife-plus`

## Come caricarlo su Shopify

### Opzione semplice

1. Comprimi la cartella `shopify-relife-plus` in `.zip`
2. In Shopify vai su:
   `Negozio online` → `Temi`
3. Clicca:
   `Aggiungi tema` → `Carica file zip`
4. Carica lo zip

### Opzione consigliata

Usa Shopify CLI:

```bash
shopify theme dev --path /Users/galluse/Desktop/magazzino-app/shopify-relife-plus
```

Oppure per push su store:

```bash
shopify theme push --path /Users/galluse/Desktop/magazzino-app/shopify-relife-plus
```

## Cose da cambiare subito dopo il caricamento

### Theme settings

- telefono
- link WhatsApp

### Homepage

- titolo hero
- testo principale
- modelli supportati
- FAQ
- dati contatto

### Pagine da creare nello store

Crea queste pagine in Shopify e assegna il template corretto:

1. `Contatti`
   template: `page.contact`
2. `Privacy Policy`
   template: `page.privacy`

## Struttura sezioni homepage

La home usa queste sezioni:

- hero
- trust bar
- feature grid
- diagnostic banner
- process steps
- supported brands
- metrics strip
- faq accordion
- final cta

## Note

- Il tema è pensato come landing / vetrina, non come catalogo e-commerce classico.
- Se vuoi, puoi aggiungere in un secondo momento recensioni, gallery casi risolti e blog tecnico.
