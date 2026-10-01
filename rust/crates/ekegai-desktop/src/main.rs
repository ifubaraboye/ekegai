//! ekegai desktop entrypoint.

mod app;
mod keys;
mod render;
mod sidebar;
mod sidebar_model;
mod scaling;
mod terminal_view;
#[allow(dead_code)]
mod theme;

fn main() {
    app::run();
}
