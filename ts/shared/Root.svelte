<script lang="ts">
    import { onMount } from "svelte";
    import { state as state } from "./appstate.svelte.js";
    import { Node } from "./node-wrapper.js";
    import { CompState, ContextData } from "./types.js";

    const { nodes, contextData }: { nodes: CompState[]; contextData: ContextData } = $props();

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
