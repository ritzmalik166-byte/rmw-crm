// UI version flag (1.0 legacy screens vs 2.0). Plain module so the server layout can inline the boot script.
export const UI_KEY = 'crm:uiVersion';
export const UI_BOOT_SCRIPT = `try{if(localStorage.getItem('${UI_KEY}')!=='2')document.documentElement.dataset.ui='v1'}catch(e){document.documentElement.dataset.ui='v1'}`;
