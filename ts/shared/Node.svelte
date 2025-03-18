<script lang="ts">
    import { ListNode } from "./list.js";
    import { Node } from "./node-wrapper.js";
    import { CompState } from "./types.js";

    const { node, index }: { node: ListNode<CompState>; index: number } = $props();
    const { next, content } = $derived(node);

    const Component = $derived(content.comp);
</script>

<Component {...content.props}>
    {#key next}
        {#if next}
            <Node node={next} index={index + 1} />
        {/if}
    {/key}
</Component>
