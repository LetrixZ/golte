import { state } from "../../shared/appstate.svelte.js";

export const page = {
    get url() {
        return state.url;
    },
};
