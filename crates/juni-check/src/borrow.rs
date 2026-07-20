//! Function-local borrow / alias tracking for `ref T` and `mut ref T`.
//!
//! WASM still represents refs as `i32` pointers; this module only enforces
//! checker rules (no runtime borrow state).

use std::collections::HashMap;

/// Identity of a memory place that refs may alias.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Place {
    /// Heap allocation from `new`.
    Heap(u32),
    /// Function parameter that is itself a ref (caller-owned).
    Param(u32),
    /// Opaque place (e.g. return value of a call that yields a ref).
    Unknown(u32),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Alias {
    pub place: Place,
    pub mutable: bool,
}

#[derive(Debug, Default)]
pub struct BorrowCx {
    next_heap: u32,
    next_unknown: u32,
    /// LocalId.0 → active alias for that local.
    locals: HashMap<u32, Alias>,
    /// Source names for locals (indexed by LocalId.0).
    names: Vec<String>,
}

impl BorrowCx {
    pub fn clear(&mut self) {
        self.next_heap = 0;
        self.next_unknown = 0;
        self.locals.clear();
        self.names.clear();
    }

    pub fn set_local_name(&mut self, local: u32, name: String) {
        let idx = local as usize;
        if self.names.len() <= idx {
            self.names.resize(idx + 1, String::new());
        }
        self.names[idx] = name;
    }

    pub fn fresh_heap(&mut self) -> Place {
        let id = self.next_heap;
        self.next_heap += 1;
        Place::Heap(id)
    }

    pub fn fresh_unknown(&mut self) -> Place {
        let id = self.next_unknown;
        self.next_unknown += 1;
        Place::Unknown(id)
    }

    pub fn param_place(local: u32) -> Place {
        Place::Param(local)
    }

    pub fn lookup(&self, local: u32) -> Option<Alias> {
        self.locals.get(&local).copied()
    }

    pub fn clear_local(&mut self, local: u32) {
        self.locals.remove(&local);
    }

    fn aliases_of(&self, place: Place, except: Option<u32>) -> Vec<(u32, bool)> {
        self.locals
            .iter()
            .filter(|(id, a)| a.place == place && Some(**id) != except)
            .map(|(id, a)| (*id, a.mutable))
            .collect()
    }

    /// Bind `local` as an alias to `place`.
    ///
    /// Mutable refs use **move** semantics: existing aliases to the same place
    /// (including the source local) must be cleared first by the caller when
    /// transferring, or this returns an error if any remain.
    pub fn bind_local(&mut self, local: u32, place: Place, mutable: bool) -> Result<(), String> {
        let others = self.aliases_of(place, Some(local));
        if mutable {
            if !others.is_empty() {
                return Err(format!(
                    "cannot create `mut ref` alias: place already borrowed ({})",
                    describe_aliases(&others, &self.names)
                ));
            }
        } else if others.iter().any(|(_, m)| *m) {
            return Err(
                "cannot create `ref` alias while a `mut ref` to the same place is active".into(),
            );
        }
        self.locals.insert(local, Alias { place, mutable });
        Ok(())
    }

    /// Move a mutable alias from `from` to `to` (or copy a shared alias).
    pub fn transfer(
        &mut self,
        from: Option<u32>,
        to: u32,
        place: Place,
        mutable: bool,
    ) -> Result<(), String> {
        if mutable {
            if let Some(src) = from {
                self.clear_local(src);
            }
            // Drop any remaining aliases to this place before taking exclusive mut.
            let leftovers: Vec<(u32, bool)> = self.aliases_of(place, Some(to));
            if !leftovers.is_empty() {
                return Err(format!(
                    "cannot move `mut ref`: conflicting aliases still active ({})",
                    describe_aliases(&leftovers, &self.names)
                ));
            }
        }
        self.bind_local(to, place, mutable)
    }

    pub fn check_write_through(&self, alias: Alias) -> Result<(), String> {
        if !alias.mutable {
            Err("cannot write through immutable `ref T` (use `mut ref T`)".into())
        } else {
            Ok(())
        }
    }

    /// Conservative escape: refs to params/heap/unknown may leave the function;
    /// this is reserved for future stack places. Always ok for current Place variants.
    pub fn check_return_place(place: Place) -> Result<(), String> {
        match place {
            Place::Heap(_) | Place::Param(_) | Place::Unknown(_) => Ok(()),
        }
    }

    /// Reject storing a caller param-ref into longer-lived storage (statics).
    pub fn check_store_escape(place: Place) -> Result<(), String> {
        match place {
            Place::Param(_) => Err(
                "cannot store parameter `ref`/`mut ref` into static storage (would escape the caller)"
                    .into(),
            ),
            Place::Heap(_) | Place::Unknown(_) => Ok(()),
        }
    }

    /// Pairwise conflict check for ref arguments to one call.
    pub fn check_call_arg_places(
        places: &[(Place, bool)],
    ) -> Result<(), String> {
        for i in 0..places.len() {
            for j in (i + 1)..places.len() {
                if places[i].0 != places[j].0 {
                    continue;
                }
                if places[i].1 || places[j].1 {
                    return Err(
                        "conflicting borrows in call arguments: `mut ref` cannot alias another ref to the same place"
                            .into(),
                    );
                }
            }
        }
        Ok(())
    }
}

fn local_label(id: u32, names: &[String]) -> String {
    names
        .get(id as usize)
        .map(|s| s.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("?")
        .to_string()
}

fn describe_aliases(others: &[(u32, bool)], names: &[String]) -> String {
    others
        .iter()
        .map(|(id, m)| {
            let name = local_label(*id, names);
            if *m {
                format!("mut ref `{name}`")
            } else {
                format!("`{name}`")
            }
        })
        .collect::<Vec<_>>()
        .join(", ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mut_conflict_uses_source_names() {
        let mut cx = BorrowCx::default();
        let place = cx.fresh_heap();
        cx.set_local_name(0, "a".into());
        cx.set_local_name(1, "b".into());
        cx.bind_local(0, place, true).unwrap();
        let err = cx.bind_local(1, place, true).unwrap_err();
        assert!(err.contains("mut ref `a`"), "{err}");
        assert!(!err.contains("local#"), "{err}");
    }

    #[test]
    fn transfer_conflict_uses_source_names() {
        let mut cx = BorrowCx::default();
        let place = Place::Param(0);
        cx.set_local_name(0, "p".into());
        cx.set_local_name(1, "a".into());
        cx.set_local_name(2, "b".into());
        cx.bind_local(0, place, false).unwrap();
        cx.bind_local(1, place, false).unwrap();
        let err = cx.transfer(Some(0), 2, place, true).unwrap_err();
        assert!(err.contains("`a`"), "{err}");
        assert!(!err.contains("local#"), "{err}");
    }
}
