import { fromArray, StoreList } from "./list.js";
import { CompState } from "./types.js";

type CSRResponse = {
    Entries: ResponseEntry[];
    ErrPage: ResponseEntry;
};

type ResponseEntry = {
    File: string;
    Props: Record<string, any>;
    CSS: string[];
};

class AppState {
    #url = $state(new URL("https://example.com"));
    #node = $state<StoreList<CompState>>(null);

    #hrefMap: Record<string, Promise<CompState[]>> = {};
    #update: (href: string) => Promise<void> = async () => {};

    get url() {
        return this.#url;
    }

    get node() {
        return this.#node;
    }

    get hrefMap() {
        return this.#hrefMap;
    }

    get update() {
        return this.#update;
    }

    initState(url: string, nodes: CompState[]) {
        this.#url = new URL(url);
        this.#node = fromArray(nodes);

        if (import.meta.env.SSR) {
            return;
        }

        this.#hrefMap = {
            [url]: new Promise((r) => r(nodes)),
        };

        this.#update = async (href: string) => {
            const array = await (this.hrefMap[href] ?? load(href));

            // this loop replaces the first differentiated node from after onto before
            // the reason this is done instead of simply replacing the first node is so we don't rerender unnecessary nodes
            // this allows for data persistence in already rendered nodes
            let before = state.node;
            let after = fromArray(array);

            while (true) {
                if (!before && !after) break; // both nodes are null - end of list, no diff

                const bcomp = before?.content.comp;
                const acomp = after?.content.comp;

                if (bcomp === acomp) {
                    // nodes are same component - compare props
                    const bprops = before?.content.props;
                    const aprops = after?.content.props;

                    if (JSON.stringify(bprops) === JSON.stringify(aprops)) {
                        // nodes have the same props - pass
                        // neiter bval nor aval can be null at this point - typescript isn't smart enough to figure that out

                        //@ts-ignore
                        before = before.next;

                        //@ts-ignore
                        after = after.next;

                        continue;
                    }
                }

                // nodes are different components or have different props - replace
                this.#node = after;
                break;
            }

            this.#url = new URL(href);
        };
    }
}

export const state = new AppState();

export async function load(href: string) {
    const headers = { Golte: "true" };
    const resp = await fetch(href, { headers });
    const json: CSRResponse = await resp.json();

    for (const entry of [...json.Entries, json.ErrPage]) {
        // load css
        for (const css of entry.CSS) {
            if (document.querySelector(`link[href="${css}"][rel="stylesheet"]`)) continue;
            const link = document.createElement("link");
            link.href = css;
            link.rel = "stylesheet";
            document.head.appendChild(link);
        }
        // TODO send css as its own field, outside of the array
    }

    const promises = json.Entries.map(async (entry) => ({
        comp: (await import(entry.File)).default,
        props: entry.Props,
        errPage: (await import(json.ErrPage.File)).default,
    }));

    return await Promise.all(promises);
}
