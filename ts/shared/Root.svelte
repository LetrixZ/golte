<script>
    import { onMount } from "svelte";
    import { state as state } from "./appstate.svelte.js";
    import { Node } from "./node-wrapper.js";

    /**
     * @typedef {Object}
     * @property {import("./types.js").CompState[]} node
     * @property {import("./types.js").ContextData} contextData
     */
    const { nodes, contextData } = $props();

    state.initState(contextData.URL, nodes);

    onMount(() => {
        history.replaceState(state.url.href, "");
        addEventListener("popstate", async (e) => {
            if (!e.state) return;
            await state.update(e.state);
        });
    });
</script>

{#key state.node}
    {#if state.node}
        <Node node={state.node} index={0} />
    {/if}
{/key}
