import { describe, expect, it } from "vitest";
import { enabledSections, homeSection, normalizeSections, sectionOn } from "./sections";

describe("board sections", () => {
  it("all on by default, in board order", () => {
    expect(enabledSections({})).toEqual(["ideas", "roadmap", "changelog", "bugs"]);
    expect(enabledSections({ sections: ["bugs", "ideas"] })).toEqual(["ideas", "bugs"]);
  });
  it("roadmap needs ideas; never none", () => {
    expect(enabledSections({ sections: ["roadmap", "bugs"] })).toEqual(["bugs"]);
    expect(enabledSections({ sections: [] })).toEqual(["ideas", "roadmap", "changelog", "bugs"]);
    expect(sectionOn({ sections: ["roadmap", "bugs"] }, "roadmap")).toBe(false);
  });
  it("home: the chosen one if on, else the first enabled", () => {
    expect(homeSection({ sections: ["ideas", "bugs"], homeSection: "bugs" })).toBe("bugs");
    expect(homeSection({ sections: ["changelog", "bugs"], homeSection: "ideas" })).toBe("changelog");
    expect(normalizeSections(["bugs", "nonsense"], "ideas")).toEqual({ sections: ["bugs"], homeSection: "bugs" });
  });
});
