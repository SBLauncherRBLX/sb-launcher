import {Component,type PropsWithChildren} from "react";
import {Button} from "@sb/ui";
export class PageErrorBoundary extends Component<PropsWithChildren,{failed:boolean}> {
  override state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  override render(){return this.state.failed?<section className="sb-card content-panel" role="alert"><h2>Could not display this page</h2><p>You can still use the sidebar. Retry to reload this section.</p><Button onClick={()=>this.setState({failed:false})}>Retry page</Button></section>:this.props.children;}
}
